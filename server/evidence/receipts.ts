/**
 * receipts.ts — chained EvidenceReceipts bound to missionId + missionRevision
 * + manifestHash. verifyReceipt/verifyChain always recompute hashes; stored
 * values are never trusted.
 */

import { randomUUID } from 'node:crypto';
import { canonicalJson } from './canonicalJson';
import { sha256Hex } from './ledger';
import type { AgentRole, EvidenceReceipt } from '../../src/types/index';

export const RECEIPT_GENESIS = 'RECEIPT_GENESIS';

export interface IssueReceiptInput {
  missionId: string;
  missionRevision: number;
  manifestHash: string;
  /** SHA-256 of the evidence payload this receipt acknowledges. */
  payloadHash: string;
  createdBy: AgentRole;
}

/** SHA-256 over all binding fields of a receipt (everything except receiptHash/createdAt). */
export function computeReceiptHash(
  r: Omit<EvidenceReceipt, 'receiptHash' | 'createdAt'>,
): string {
  return sha256Hex(
    canonicalJson({
      receiptId: r.receiptId,
      missionId: r.missionId,
      missionRevision: r.missionRevision,
      manifestHash: r.manifestHash,
      payloadHash: r.payloadHash,
      previousReceiptHash: r.previousReceiptHash,
      createdBy: r.createdBy,
    }),
  );
}

export interface ChainVerification {
  isValid: boolean;
  /** receiptId of the first receipt that fails recomputation, if any. */
  brokenAt: string | null;
}

export class ReceiptChain {
  private readonly receipts: EvidenceReceipt[] = [];

  /** Issue a receipt bound to the mission/manifest and chained to the previous one. */
  issueReceipt(input: IssueReceiptInput): EvidenceReceipt {
    const partial = {
      receiptId: randomUUID(),
      missionId: input.missionId,
      missionRevision: input.missionRevision,
      manifestHash: input.manifestHash,
      payloadHash: input.payloadHash,
      previousReceiptHash:
        this.receipts.length === 0
          ? RECEIPT_GENESIS
          : this.receipts[this.receipts.length - 1].receiptHash,
      createdBy: input.createdBy,
    };
    const receipt: EvidenceReceipt = {
      ...partial,
      receiptHash: computeReceiptHash(partial),
      createdAt: new Date().toISOString(),
    };
    this.receipts.push(receipt);
    return structuredClone(receipt);
  }

  /** Recompute a single receipt's hash. */
  verifyReceipt(receipt: EvidenceReceipt): boolean {
    return receipt.receiptHash === computeReceiptHash(receipt);
  }

  /** Recompute hashes and chain linkage over the whole export (or given list). */
  verifyChain(receipts?: EvidenceReceipt[]): ChainVerification {
    const list = receipts ?? this.receipts;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const expectedPrev = i === 0 ? RECEIPT_GENESIS : list[i - 1].receiptHash;
      if (r.previousReceiptHash !== expectedPrev || !this.verifyReceipt(r)) {
        return { isValid: false, brokenAt: r.receiptId };
      }
    }
    return { isValid: true, brokenAt: null };
  }

  /**
   * Read-only snapshot for verifiers — strukturierte Tiefenkopien
   * (EvidenceReceipt-Felder sind aktuell skalar; die Tiefenkopie haertet
   * gegen kuenftige verschachtelte Felder ab).
   */
  exportReceipts(): EvidenceReceipt[] {
    return structuredClone(this.receipts);
  }
}
