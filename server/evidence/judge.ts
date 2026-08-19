/**
 * judge.ts — pure, stateless, non-mutating judgment over provided copies.
 * The Judge holds no state, has no ledger access, and never mutates inputs.
 * Verdicts are exclusively VERIFIED | BLOCKED_BY_MISSING_EVIDENCE | CONTRADICTED.
 */

import { canonicalJson } from './canonicalJson';
import { computeBlockHash, sha256Hex, type EvidenceBlock } from './ledger';
import { computeReceiptHash } from './receipts';
import type { EvidenceReceipt, VerdictRecord } from '../../src/types/index';

export class Judge {
  private constructor() {
    // Pure function collection — instantiation is pointless.
  }

  /**
   * Judge a claim against the given evidence and receipt copies.
   *
   * Rules:
   * - no evidence for the claim          -> BLOCKED_BY_MISSING_EVIDENCE
   * - any hash-invalid or mutually       -> CONTRADICTED
   *   contradictory evidence
   * - consistent, hash-valid evidence    -> VERIFIED
   *
   * Inputs are treated as immutable; nothing is mutated or stored.
   */
  static judge(
    claim: string,
    evidence: readonly EvidenceBlock[],
    receipts: readonly EvidenceReceipt[],
  ): VerdictRecord {
    const judgedAt = new Date().toISOString();
    const relevant = evidence.filter((b) => b.claim === claim);

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

    // Hash validity: every block must recompute.
    for (const b of relevant) {
      if (b.blockHash !== computeBlockHash(b)) {
        contradictions.push(`block ${b.blockIndex}: blockHash does not recompute`);
      }
      if (b.payloadHash !== sha256Hex(canonicalJson(b.payload))) {
        contradictions.push(`block ${b.blockIndex}: payloadHash does not recompute`);
      }
    }

    // Consistency: payload values for the same claim must agree canonically.
    const canonicalPayloads = new Set(relevant.map((b) => canonicalJson(b.payload)));
    if (canonicalPayloads.size > 1) {
      contradictions.push(
        `conflicting payloads for claim (${canonicalPayloads.size} distinct values)`,
      );
    }

    // Manifest binding: all evidence for a claim must agree on manifest/revision.
    const bindings = new Set(relevant.map((b) => `${b.manifestHash}@${b.missionRevision}`));
    if (bindings.size > 1) {
      contradictions.push('evidence bound to different manifest revisions');
    }

    // Receipts: any receipt presented for this claim's payload must recompute.
    const payloadHashes = new Set(relevant.map((b) => b.payloadHash));
    for (const r of receipts) {
      if (payloadHashes.has(r.payloadHash) && r.receiptHash !== computeReceiptHash(r)) {
        contradictions.push(`receipt ${r.receiptId}: receiptHash does not recompute`);
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

    return {
      subject: claim,
      verdict: 'VERIFIED',
      rationale: `Consistent, hash-valid evidence from ${relevant.length} block(s).`,
      judgedAt,
    };
  }
}
