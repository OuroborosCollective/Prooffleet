/**
 * consentEngine.ts — operation-bound Consent (SPEC Abschnitt 3, Coder B).
 *
 * Haerte-Garantien:
 * - KEIN Auto-Approve, KEIN Timeout-Approve, KEIN setTimeout-basiertes Approve.
 *   Ein Grant entsteht AUSSCHLIESSLICH durch einen expliziten respond()-Aufruf
 *   mit operatorIdentity. Pending-Requests bleiben PENDING, bis ein Mensch
 *   entscheidet; sie laufen nie "von selbst" in APPROVED.
 * - Consent ist an GENAU EINE OperationSpec gebunden:
 *   operationHash = sha256Hex(canonicalJson(spec)).
 * - Eine echte menschliche Entscheidung (APPROVED oder REJECTED) wird getrennt
 *   von der Ausfuehrungsfreigabe validiert. REJECTED darf als authentische
 *   Entscheidung gelten, autorisiert aber niemals Execution.
 */

import { randomUUID } from 'node:crypto';

import { canonicalJson, sha256Hex } from '../evidence/canonicalJson';
import type { OperationSpec } from '../../src/types/index';
import type { ConsentGrant } from '../../src/types/index';
import type {
  ConsentDecision,
  ConsentRequest,
  GrantValidation,
  RiskLevel,
} from './consentTypes';

export interface ConsentEngineOptions {
  /** Gültigkeitsdauer eines Grants in Millisekunden. Default: 5 Minuten. */
  grantTtlMs?: number;
  /** Injizierbare Zeitquelle (Default: Date.now). Kein Timer, nur Lesen. */
  now?: () => number;
  /** Injizierbare ID-Erzeugung (Default: crypto.randomUUID). */
  idGenerator?: () => string;
}

const DEFAULT_GRANT_TTL_MS = 5 * 60 * 1000;

export class ConsentEngine {
  private readonly requests = new Map<string, ConsentRequest>();
  private readonly grantTtlMs: number;
  private readonly now: () => number;
  private readonly idGenerator: () => string;

  constructor(options: ConsentEngineOptions = {}) {
    this.grantTtlMs = options.grantTtlMs ?? DEFAULT_GRANT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  /**
   * Erzeugt einen PENDING ConsentRequest für genau diese OperationSpec.
   * Der operationHash bindet jede spätere Entscheidung an operationId,
   * parametersHash, missionId und missionRevision dieser Spec.
   */
  createRequest(
    spec: OperationSpec,
    riskLevel: RiskLevel,
    justification: string,
  ): ConsentRequest {
    const operationHash = sha256Hex(canonicalJson(spec));
    const request: ConsentRequest = {
      requestId: this.idGenerator(),
      operationHash,
      operationId: spec.operationId,
      parametersHash: spec.parametersHash,
      missionId: spec.missionId,
      missionRevision: spec.missionRevision,
      spec: Object.freeze({ ...spec, parameters: { ...spec.parameters } }),
      riskLevel,
      justification,
      status: 'PENDING',
      requestedAt: new Date(this.now()).toISOString(),
    };
    this.requests.set(request.requestId, request);
    return request;
  }

  /**
   * Menschliche Operator-Entscheidung. NIE automatisch, NIE per Timeout —
   * es existiert kein Code-Pfad, der einen Request ohne diesen expliziten
   * Aufruf aus PENDING heraus bewegt.
   *
   * @returns den ConsentGrant, oder null wenn der Request unbekannt oder
   *          bereits entschieden ist.
   */
  respond(
    requestId: string,
    decision: ConsentDecision,
    operatorIdentity: string,
    reason?: string,
  ): ConsentGrant | null {
    const request = this.requests.get(requestId);
    if (!request) {
      return null;
    }
    if (request.status !== 'PENDING') {
      return null;
    }
    if (!operatorIdentity || operatorIdentity.trim().length === 0) {
      return null;
    }

    const decidedAtMs = this.now();
    request.status = decision;
    request.decidedAt = new Date(decidedAtMs).toISOString();
    request.decidedBy = operatorIdentity;
    request.decisionReason = reason;

    const grant: ConsentGrant = {
      requestId: request.requestId,
      operationHash: request.operationHash,
      decision,
      operatorIdentity,
      decidedAt: new Date(decidedAtMs).toISOString(),
      expiresAt: new Date(decidedAtMs + this.grantTtlMs).toISOString(),
    };
    return grant;
  }

  /**
   * Validiert, dass eine Entscheidung wirklich von DIESER Engine fuer GENAU
   * diese OperationSpec ausgestellt wurde. APPROVED und REJECTED sind hier
   * beide zulaessig; diese Methode autorisiert keine Execution.
   */
  validateDecisionForOperation(
    grant: ConsentGrant,
    spec: OperationSpec,
  ): GrantValidation {
    const request = this.requests.get(grant.requestId);
    if (!request) {
      return { valid: false, reason: 'requestId was not issued by this ConsentEngine' };
    }

    const specHash = sha256Hex(canonicalJson(spec));
    if (grant.operationHash !== specHash) {
      return {
        valid: false,
        reason: 'operationHash mismatch: grant is bound to a different OperationSpec',
      };
    }
    if (request.operationHash !== grant.operationHash) {
      return { valid: false, reason: 'grant operationHash does not match issued request' };
    }
    if (
      request.operationId !== spec.operationId ||
      request.parametersHash !== spec.parametersHash ||
      request.missionId !== spec.missionId ||
      request.missionRevision !== spec.missionRevision
    ) {
      return { valid: false, reason: 'issued request identity does not match OperationSpec' };
    }
    if (request.status !== grant.decision) {
      return { valid: false, reason: 'grant decision does not match stored human decision' };
    }
    if (request.decidedBy !== grant.operatorIdentity) {
      return { valid: false, reason: 'grant operatorIdentity does not match stored operator identity' };
    }
    if (request.decidedAt !== grant.decidedAt) {
      return { valid: false, reason: 'grant decidedAt does not match stored decision timestamp' };
    }

    const decidedAtMs = Date.parse(grant.decidedAt);
    const expiresAtMs = Date.parse(grant.expiresAt);
    if (Number.isNaN(decidedAtMs) || Number.isNaN(expiresAtMs)) {
      return { valid: false, reason: 'grant decision/expiry timestamp is invalid' };
    }
    if (expiresAtMs !== decidedAtMs + this.grantTtlMs) {
      return { valid: false, reason: 'grant expiry does not match ConsentEngine issuance policy' };
    }
    if (this.now() >= expiresAtMs) {
      return { valid: false, reason: 'grant expired' };
    }

    return { valid: true, reason: 'decision authentic and bound to this operation' };
  }

  /**
   * Ausfuehrungsfreigabe: erst echte Engine-Entscheidung pruefen, danach hart
   * APPROVED verlangen. REJECTED bleibt fuer Execution immer ungueltig.
   */
  validateGrantForOperation(
    grant: ConsentGrant,
    spec: OperationSpec,
  ): GrantValidation {
    const decisionValidation = this.validateDecisionForOperation(grant, spec);
    if (!decisionValidation.valid) return decisionValidation;

    if (grant.decision !== 'APPROVED') {
      return {
        valid: false,
        reason: `decision is ${grant.decision}, not APPROVED`,
      };
    }
    return { valid: true, reason: 'grant valid for execution of this operation' };
  }

  /** Alle Requests mit status === 'PENDING' (Kopie, Anzeige-Reihenfolge). */
  getPendingRequests(): ConsentRequest[] {
    return [...this.requests.values()].filter((r) => r.status === 'PENDING');
  }

  getRequest(id: string): ConsentRequest | undefined {
    return this.requests.get(id);
  }

  getAllRequests(): ConsentRequest[] {
    return [...this.requests.values()];
  }
}
