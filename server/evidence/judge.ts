/**
 * judge.ts — pure, stateless, non-mutating judgment over provided copies.
 * The Judge holds no state, has no ledger access, and never mutates inputs.
 * Verdicts are exclusively VERIFIED | BLOCKED_BY_MISSING_EVIDENCE | CONTRADICTED.
 *
 * IMPORTANT: hash-valid evidence proves integrity, not external truth. Runtime
 * claims may supply ProofRequirements that can only be satisfied by explicitly
 * allowed authoritative source kinds and matching operation/revision bindings.
 */

import { canonicalJson } from './canonicalJson';
import { computeBlockHash, sha256Hex, type EvidenceBlock } from './ledger';
import { computeReceiptHash } from './receipts';
import type {
  EvidenceAssertion,
  EvidenceReceipt,
  EvidenceSourceKind,
  ProofRequirement,
  VerdictRecord,
} from '../../src/types/index';

interface ProofPayload {
  evidenceType?: string;
  sourceKind?: EvidenceSourceKind;
  assertion?: EvidenceAssertion;
  operationId?: string;
  sourceRevision?: string;
  deploymentRevision?: string;
  consentApproved?: boolean;
  [key: string]: unknown;
}

function proofPayload(value: unknown): ProofPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as ProofPayload;
}

function blockIntegrityError(block: EvidenceBlock): string | null {
  if (block.blockHash !== computeBlockHash(block)) {
    return `block ${block.blockIndex}: blockHash does not recompute`;
  }
  if (block.payloadHash !== sha256Hex(canonicalJson(block.payload))) {
    return `block ${block.blockIndex}: payloadHash does not recompute`;
  }
  return null;
}

function hasValidReceipt(block: EvidenceBlock, receipts: readonly EvidenceReceipt[]): boolean {
  return receipts.some(
    (receipt) =>
      receipt.payloadHash === block.payloadHash &&
      receipt.receiptHash === computeReceiptHash(receipt),
  );
}

export class Judge {
  private constructor() {
    // Pure function collection — instantiation is pointless.
  }

  /**
   * Judge a claim against evidence/receipt snapshots.
   *
   * Base integrity rules:
   * - no evidence for the claim          -> BLOCKED_BY_MISSING_EVIDENCE
   * - hash-invalid / conflicting claim   -> CONTRADICTED
   * - final mission evidence carrying explicit consentApproved=false can prove
   *   the rejection happened, but can NEVER prove the requested effect happened
   *
   * Optional proof requirements:
   * - requirement candidates are searched across the WHOLE evidence snapshot,
   *   not only blocks whose claim text equals `claim`;
   * - only assertion=OBSERVED can satisfy a requirement;
   * - assertion=CONTRADICTED produces CONTRADICTED;
   * - source kind, operation id and optional revision bindings must match;
   * - every satisfying block needs a recomputing receipt;
   * - runtimeRequired cannot be satisfied by STATIC_CANDIDATE.
   */
  static judge(
    claim: string,
    evidence: readonly EvidenceBlock[],
    receipts: readonly EvidenceReceipt[],
    requirements: readonly ProofRequirement[] = [],
  ): VerdictRecord {
    const judgedAt = new Date().toISOString();
    const relevant = evidence.filter((block) => block.claim === claim);

    if (relevant.length === 0) {
      return {
        subject: claim,
        verdict: 'BLOCKED_BY_MISSING_EVIDENCE',
        rationale: 'No evidence blocks found for this claim.',
        missingEvidence: [claim],
        judgedAt,
      };
    }

    const contradictions: string[] = [];

    for (const block of relevant) {
      const error = blockIntegrityError(block);
      if (error) contradictions.push(error);
    }

    const canonicalPayloads = new Set(relevant.map((block) => canonicalJson(block.payload)));
    if (canonicalPayloads.size > 1) {
      contradictions.push(
        `conflicting payloads for claim (${canonicalPayloads.size} distinct values)`,
      );
    }

    const bindings = new Set(
      relevant.map((block) => `${block.manifestHash}@${block.missionRevision}`),
    );
    if (bindings.size > 1) {
      contradictions.push('evidence bound to different manifest revisions');
    }

    const relevantPayloadHashes = new Set(relevant.map((block) => block.payloadHash));
    for (const receipt of receipts) {
      if (
        relevantPayloadHashes.has(receipt.payloadHash) &&
        receipt.receiptHash !== computeReceiptHash(receipt)
      ) {
        contradictions.push(`receipt ${receipt.receiptId}: receiptHash does not recompute`);
      }
    }

    if (contradictions.length > 0) {
      return {
        subject: claim,
        verdict: 'CONTRADICTED',
        rationale: 'Evidence is hash-invalid or mutually contradictory.',
        contradictions,
        judgedAt,
      };
    }

    // A rejected human authorization is authoritative evidence that the write
    // was intentionally NOT authorized. It may be an integrity-valid record,
    // but the requested mission effect is still absent and therefore cannot be
    // reported as VERIFIED.
    if (
      claim === 'mission finalized' &&
      relevant.some((block) => proofPayload(block.payload)?.consentApproved === false)
    ) {
      return {
        subject: claim,
        verdict: 'BLOCKED_BY_MISSING_EVIDENCE',
        rationale: 'Operator rejected the requested effect; no authorized external-effect readback can exist.',
        missingEvidence: ['approved_operation_effect'],
        judgedAt,
      };
    }

    const missingEvidence: string[] = [];

    for (const requirement of requirements) {
      const minCount = Math.max(1, requirement.minCount ?? 1);
      let satisfiedCount = 0;
      let requirementContradicted = false;

      const candidates = evidence.filter((block) => {
        const payload = proofPayload(block.payload);
        return payload?.evidenceType === requirement.evidenceType;
      });

      for (const block of candidates) {
        const integrityError = blockIntegrityError(block);
        if (integrityError) {
          contradictions.push(`${requirement.requirementId}: ${integrityError}`);
          requirementContradicted = true;
          continue;
        }

        const payload = proofPayload(block.payload);
        if (!payload) continue;

        if (payload.assertion === 'CONTRADICTED') {
          contradictions.push(
            `${requirement.requirementId}: authoritative observation reports contradiction`,
          );
          requirementContradicted = true;
          continue;
        }
        if (payload.assertion !== 'OBSERVED') continue;
        if (!payload.sourceKind || !requirement.allowedSourceKinds.includes(payload.sourceKind)) {
          continue;
        }
        if (requirement.runtimeRequired && payload.sourceKind === 'STATIC_CANDIDATE') {
          continue;
        }
        if (requirement.operationId && payload.operationId !== requirement.operationId) {
          continue;
        }
        if (requirement.sourceRevision && payload.sourceRevision !== requirement.sourceRevision) {
          continue;
        }
        if (
          requirement.deploymentRevision &&
          payload.deploymentRevision !== requirement.deploymentRevision
        ) {
          continue;
        }
        if (!hasValidReceipt(block, receipts)) continue;

        satisfiedCount += 1;
      }

      if (!requirementContradicted && satisfiedCount < minCount) {
        missingEvidence.push(requirement.requirementId);
      }
    }

    if (contradictions.length > 0) {
      return {
        subject: claim,
        verdict: 'CONTRADICTED',
        rationale: 'A required proof observation is contradictory or invalid.',
        contradictions,
        judgedAt,
      };
    }

    if (missingEvidence.length > 0) {
      return {
        subject: claim,
        verdict: 'BLOCKED_BY_MISSING_EVIDENCE',
        rationale: 'Claim integrity is valid, but required authoritative proof is missing.',
        missingEvidence,
        judgedAt,
      };
    }

    return {
      subject: claim,
      verdict: 'VERIFIED',
      rationale:
        requirements.length > 0
          ? `Claim integrity and ${requirements.length} authoritative proof requirement(s) verified.`
          : `Consistent, hash-valid evidence from ${relevant.length} block(s).`,
      judgedAt,
    };
  }
}
