/**
 * operationExecutor.ts — idempotenter Operation-Executor mit
 * Readback-before-retry und Consent-Gate (SPEC Abschnitt 3, Coder B).
 *
 * Garantien:
 * - Idempotency: gleiche operationId -> gespeichertes finales Result,
 *   handler.apply wird NICHT erneut aufgerufen.
 * - Readback-before-retry: fuer kind 'write'/'execute' laeuft VOR dem
 *   Erstversuch und VOR jedem Retry handler.readback(spec). Zeigt der
 *   Readback den Zielzustand bereits, gilt die Operation als
 *   'already_applied' und es wird NICHT geschrieben.
 * - kind 'write'/'execute' ohne validen Grant -> 'blocked_consent_required',
 *   kein apply. kind 'read' braucht keinen Grant.
 * - Retry: max. 3 Versuche (konfigurierbar), exponential backoff mit
 *   injizierbarer sleep-Funktion, niemals ein Retry ohne vorherigen Readback.
 */

import { canonicalJson, sha256Hex } from '../evidence/canonicalJson';
import type { ConsentGrant, OperationSpec } from '../../src/types/index';

export interface OperationHandler {
  apply(spec: OperationSpec): Promise<unknown>;
  /**
   * Readback-Vertrag: liefert den tatsaechlichen Zustand der Zielressource.
   * Rueckgabe-Konvention:
   *  - null / undefined            -> Zielzustand NICHT erreicht
   *  - { applied: boolean, ... }   -> 'applied' entscheidet; Rest ist Evidence
   *  - jeder andere truthy Wert    -> Zielzustand erreicht, Wert ist Evidence
   */
  readback(spec: OperationSpec): Promise<unknown>;
}

export type OperationStatus =
  | 'applied'
  | 'already_applied'
  | 'blocked_consent_required'
  | 'failed';

export interface OperationResult {
  status: OperationStatus;
  operationId: string;
  attempts: number;
  readbackEvidence?: unknown;
  error?: string;
}

export interface GrantValidator {
  validateGrantForOperation(
    grant: ConsentGrant,
    spec: OperationSpec,
  ): { valid: boolean; reason: string };
}

export interface OperationExecutorOptions {
  /**
   * Validator fuer ConsentGrants (typisch: ConsentEngine-Instanz).
   * Default: intrinsische Pruefung (operationHash-Match, APPROVED, Ablauf).
   */
  grantValidator?: GrantValidator;
  /** Maximale Versuche inkl. Erstversuch. Default: 3. */
  maxAttempts?: number;
  /** Basis fuer exponential backoff in ms (Delay = base * 2^(attempt-1)). */
  baseBackoffMs?: number;
  /** Injizierbare Sleep-Funktion (Tests: sofort resolve). */
  sleep?: (ms: number) => Promise<void>;
  /** Injizierbare Zeitquelle fuer den Default-Validator. */
  now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Intrinsische Grant-Pruefung ohne externe Engine (gleiche Regeln). */
class IntrinsicGrantValidator implements GrantValidator {
  constructor(private readonly now: () => number) {}

  validateGrantForOperation(
    grant: ConsentGrant,
    spec: OperationSpec,
  ): { valid: boolean; reason: string } {
    const specHash = sha256Hex(canonicalJson(spec));
    if (grant.operationHash !== specHash) {
      return { valid: false, reason: 'operationHash mismatch' };
    }
    if (grant.decision !== 'APPROVED') {
      return {
        valid: false,
        reason: `decision is ${grant.decision}, not APPROVED`,
      };
    }
    const expiresAtMs = Date.parse(grant.expiresAt);
    if (Number.isNaN(expiresAtMs) || this.now() >= expiresAtMs) {
      return { valid: false, reason: 'grant expired or invalid expiresAt' };
    }
    return { valid: true, reason: 'grant valid for this operation' };
  }
}

interface ReadbackVerdict {
  applied: boolean;
  evidence?: unknown;
}

function interpretReadback(value: unknown): ReadbackVerdict {
  if (value === null || value === undefined) {
    return { applied: false };
  }
  if (typeof value === 'object' && 'applied' in value) {
    const rec = value as { applied: unknown };
    if (typeof rec.applied === 'boolean') {
      return { applied: rec.applied, evidence: value };
    }
  }
  return { applied: Boolean(value), evidence: value };
}

export class OperationExecutor {
  private readonly finalResults = new Map<string, OperationResult>();
  private readonly grantValidator: GrantValidator;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: OperationExecutorOptions = {}) {
    const now = options.now ?? (() => Date.now());
    this.grantValidator =
      options.grantValidator ?? new IntrinsicGrantValidator(now);
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 250;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async execute(
    spec: OperationSpec,
    handler: OperationHandler,
    grant?: ConsentGrant,
  ): Promise<OperationResult> {
    // Idempotency: finales Result zurueckgeben, keine Re-Execution.
    const cached = this.finalResults.get(spec.operationId);
    if (cached) {
      return cached;
    }

    const needsConsent = spec.kind === 'write' || spec.kind === 'execute';

    if (needsConsent) {
      if (!grant) {
        return this.finish(spec.operationId, {
          status: 'blocked_consent_required',
          operationId: spec.operationId,
          attempts: 0,
          error: 'write/execute operation requires a valid ConsentGrant',
        });
      }
      const validation = this.grantValidator.validateGrantForOperation(
        grant,
        spec,
      );
      if (!validation.valid) {
        return this.finish(spec.operationId, {
          status: 'blocked_consent_required',
          operationId: spec.operationId,
          attempts: 0,
          error: `consent grant invalid: ${validation.reason}`,
        });
      }
    }

    let attempts = 0;
    let lastError: string | undefined;

    while (attempts < this.maxAttempts) {
      // Readback VOR jedem Versuch (Erstversuch und jeder Retry) — fuer
      // read liefert der Readback selbst das Ergebnis.
      let rb: ReadbackVerdict;
      try {
        rb = interpretReadback(await handler.readback(spec));
      } catch (err) {
        rb = { applied: false };
        lastError = `readback failed: ${errorMessage(err)}`;
      }

      if (spec.kind === 'read') {
        attempts += 1;
        if (rb.applied) {
          return this.finish(spec.operationId, {
            status: 'applied',
            operationId: spec.operationId,
            attempts,
            readbackEvidence: rb.evidence,
          });
        }
        lastError = lastError ?? 'readback returned no data';
      } else if (rb.applied) {
        // Zielzustand bereits erreicht -> KEIN apply.
        return this.finish(spec.operationId, {
          status: 'already_applied',
          operationId: spec.operationId,
          attempts,
          readbackEvidence: rb.evidence,
        });
      } else {
        attempts += 1;
        try {
          await handler.apply(spec);
          const confirm = interpretReadback(await handler.readback(spec));
          if (confirm.applied) {
            return this.finish(spec.operationId, {
              status: 'applied',
              operationId: spec.operationId,
              attempts,
              readbackEvidence: confirm.evidence,
            });
          }
          lastError = 'apply completed but readback does not show target state';
        } catch (err) {
          lastError = errorMessage(err);
        }
      }

      // Exponential backoff vor dem naechsten Versuch (nie ohne Readback danach).
      if (attempts < this.maxAttempts) {
        await this.sleep(this.baseBackoffMs * 2 ** (attempts - 1));
      }
    }

    return this.finish(spec.operationId, {
      status: 'failed',
      operationId: spec.operationId,
      attempts,
      error: lastError ?? 'max attempts exceeded',
    });
  }

  /** Gespeichertes finales Result einer operationId, falls vorhanden. */
  getResult(operationId: string): OperationResult | undefined {
    return this.finalResults.get(operationId);
  }

  private finish(
    operationId: string,
    result: OperationResult,
  ): OperationResult {
    this.finalResults.set(operationId, result);
    return result;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
