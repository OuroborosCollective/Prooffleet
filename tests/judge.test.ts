/**
 * tests/judge.test.ts — alle drei Urteile, Nicht-Mutation, fehlende Evidence
 * (SPEC §2/§7).
 */
import { describe, it, expect } from 'vitest';

import { Judge, EvidenceLedger, ReceiptChain, canonicalJson, sha256Hex } from '../server/evidence/index';

const MANIFEST = sha256Hex(canonicalJson({ missionId: 'mj', revision: 1 }));

function ledgerWith(claim: string, payloads: unknown[]) {
  const ledger = new EvidenceLedger();
  for (const payload of payloads) {
    ledger.seal({ agentId: 'analyst', claim, payload, manifestHash: MANIFEST, missionRevision: 1 });
  }
  return ledger;
}

describe('Judge', () => {
  it('VERIFIED for consistent, hash-valid evidence', () => {
    // Arrange
    const ledger = ledgerWith('claim-ok', [{ v: 1 }, { v: 1 }]);
    const receipts = new ReceiptChain();
    const block = ledger.getChain()[0];
    receipts.issueReceipt({
      missionId: 'mj', missionRevision: 1, manifestHash: MANIFEST,
      payloadHash: block.payloadHash, createdBy: 'analyst',
    });

    // Act
    const verdict = Judge.judge('claim-ok', ledger.getChain(), receipts.exportReceipts());

    // Assert
    expect(verdict.verdict).toBe('VERIFIED');
    expect(verdict.subject).toBe('claim-ok');
  });

  it('BLOCKED_BY_MISSING_EVIDENCE when no evidence exists for the claim', () => {
    // Arrange
    const ledger = ledgerWith('other-claim', [{ v: 1 }]);

    // Act
    const verdict = Judge.judge('never-sealed', ledger.getChain(), []);

    // Assert
    expect(verdict.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
    expect(verdict.missingEvidence).toContain('never-sealed');
  });

  it('verdict without any evidence at all is BLOCKED_BY_MISSING_EVIDENCE', () => {
    // Arrange — leere Ledger-/Receipt-Snapshots.

    // Act
    const verdict = Judge.judge('anything', [], []);

    // Assert
    expect(verdict.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
  });

  it('CONTRADICTED for mutually conflicting payloads of the same claim', () => {
    // Arrange
    const ledger = ledgerWith('claim-conflict', [{ v: 1 }, { v: 2 }]);

    // Act
    const verdict = Judge.judge('claim-conflict', ledger.getChain(), []);

    // Assert
    expect(verdict.verdict).toBe('CONTRADICTED');
    expect(verdict.contradictions?.length).toBeGreaterThan(0);
  });

  it('CONTRADICTED when a block hash does not recompute', () => {
    // Arrange
    const ledger = ledgerWith('claim-tampered', [{ v: 1 }]);
    const chain = ledger.getChain();
    chain[0] = { ...chain[0], payload: { v: 2 } };

    // Act
    const verdict = Judge.judge('claim-tampered', chain, []);

    // Assert
    expect(verdict.verdict).toBe('CONTRADICTED');
  });

  it('does not mutate the evidence chain (deep snapshot comparison)', () => {
    // Arrange
    const ledger = ledgerWith('claim-immut', [{ v: 1 }, { v: 1 }]);
    const receipts = new ReceiptChain();
    receipts.issueReceipt({
      missionId: 'mj', missionRevision: 1, manifestHash: MANIFEST,
      payloadHash: ledger.getChain()[0].payloadHash, createdBy: 'analyst',
    });
    const chainBefore = JSON.stringify(ledger.getChain());
    const receiptsBefore = JSON.stringify(receipts.exportReceipts());

    // Act
    Judge.judge('claim-immut', ledger.getChain(), receipts.exportReceipts());

    // Assert
    expect(JSON.stringify(ledger.getChain())).toBe(chainBefore);
    expect(JSON.stringify(receipts.exportReceipts())).toBe(receiptsBefore);
  });
});
