/**
 * verifier.ts — IndependentVerifier. Works ONLY on read-only snapshot copies
 * (EvidenceLedger.getChain(), ReceiptChain.exportReceipts()). It holds no
 * references to mutable ledger/mission state and has no write access.
 */

import { canonicalJson } from './canonicalJson';
import {
  computeBlockHash,
  sha256Hex,
  verifyBlockSignature,
  type EvidenceBlock,
  type LedgerVerification,
} from './ledger';
import { computeReceiptHash, RECEIPT_GENESIS } from './receipts';
import type { EvidenceReceipt, VerdictRecord } from '../../src/types/index';

export interface LedgerSnapshotVerification extends LedgerVerification {
  /** Per-block detail for audit output. */
  invalidBlocks: number[];
  /** Blocks whose HMAC could not be verified (unsigned or wrong secret). */
  unauthenticatedBlocks: number[];
}

export interface ReceiptBindingCheck {
  bound: boolean;
  reason: string;
}

export class IndependentVerifier {
  /** Snapshot copies only — verifier never touches live ledgers. */
  constructor(
    private readonly ledgerSnapshot: readonly EvidenceBlock[] = [],
    private readonly receiptSnapshot: readonly EvidenceReceipt[] = [],
  ) {}

  /** Recompute every block hash and chain linkage on the snapshot. */
  verifyLedger(snapshot?: readonly EvidenceBlock[]): LedgerSnapshotVerification {
    const blocks = snapshot ?? this.ledgerSnapshot;
    const invalidBlocks: number[] = [];
    const unauthenticatedBlocks: number[] = [];
    let brokenAt: number | null = null;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const expectedPrev = i === 0 ? 'GENESIS' : blocks[i - 1].blockHash;
      let ok = b.blockIndex === i && b.previousHash === expectedPrev;
      ok = ok && b.payloadHash === sha256Hex(canonicalJson(b.payload));
      ok = ok && b.blockHash === computeBlockHash(b);
      if (!ok) {
        invalidBlocks.push(i);
        if (brokenAt === null) brokenAt = i;
      }
      if (!verifyBlockSignature(b.blockHash, b.signature)) {
        unauthenticatedBlocks.push(i);
      }
    }
    return { isValid: invalidBlocks.length === 0, brokenAt, invalidBlocks, unauthenticatedBlocks };
  }

  /**
   * Check that a receipt is bound to the given mission manifest:
   * hash recomputation plus manifestHash/missionRevision match.
   */
  verifyReceiptBinding(
    receipt: EvidenceReceipt,
    manifest: { manifestHash: string; missionId: string; missionRevision: number },
  ): ReceiptBindingCheck {
    if (receipt.receiptHash !== computeReceiptHash(receipt)) {
      return { bound: false, reason: 'receiptHash does not recompute — tampered' };
    }
    if (receipt.manifestHash !== manifest.manifestHash) {
      return { bound: false, reason: 'manifestHash mismatch' };
    }
    if (receipt.missionId !== manifest.missionId) {
      return { bound: false, reason: 'missionId mismatch' };
    }
    if (receipt.missionRevision !== manifest.missionRevision) {
      return { bound: false, reason: 'missionRevision mismatch' };
    }
    return { bound: true, reason: 'receipt bound to manifest' };
  }

  /**
   * Attest a subject (receiptHash or blockHash) against the read-only snapshots.
   * Returns a VerdictRecord; unknown subjects are honestly reported as missing.
   */
  attest(subject: string): VerdictRecord {
    const judgedAt = new Date().toISOString();

    const receipt = this.receiptSnapshot.find((r) => r.receiptHash === subject);
    if (receipt) {
      const idx = this.receiptSnapshot.indexOf(receipt);
      const expectedPrev = idx === 0 ? RECEIPT_GENESIS : this.receiptSnapshot[idx - 1].receiptHash;
      const ok =
        receipt.previousReceiptHash === expectedPrev &&
        receipt.receiptHash === computeReceiptHash(receipt);
      return ok
        ? { subject, verdict: 'VERIFIED', rationale: 'Receipt hash recomputes and chain link is intact.', judgedAt }
        : {
            subject,
            verdict: 'CONTRADICTED',
            rationale: 'Receipt hash or chain linkage fails recomputation.',
            contradictions: ['receipt hash/chain mismatch'],
            judgedAt,
          };
    }

    const block = this.ledgerSnapshot.find((b) => b.blockHash === subject);
    if (block) {
      const recomputed = computeBlockHash(block);
      const payloadOk = block.payloadHash === sha256Hex(canonicalJson(block.payload));
      if (recomputed === block.blockHash && payloadOk) {
        return {
          subject,
          verdict: 'VERIFIED',
          rationale: 'Block hash and payload hash recompute correctly.',
          judgedAt,
        };
      }
      return {
        subject,
        verdict: 'CONTRADICTED',
        rationale: 'Block hash or payload hash fails recomputation.',
        contradictions: ['block hash mismatch'],
        judgedAt,
      };
    }

    return {
      subject,
      verdict: 'BLOCKED_BY_MISSING_EVIDENCE',
      rationale: 'Subject not present in the verifier snapshots.',
      missingEvidence: [subject],
      judgedAt,
    };
  }
}
