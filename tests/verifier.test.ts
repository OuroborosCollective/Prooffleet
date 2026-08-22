/**
 * tests/verifier.test.ts — IndependentVerifier erkennt manipulierte Kopien und
 * hat keinen Schreibzugriff (SPEC §2/§7).
 */
import { describe, it, expect } from 'vitest';

import {
  IndependentVerifier,
  EvidenceLedger,
  ReceiptChain,
  canonicalJson,
  sha256Hex,
} from '../server/evidence/index';

const MANIFEST = sha256Hex(canonicalJson({ missionId: 'mv', revision: 1 }));

function fixture() {
  const ledger = new EvidenceLedger();
  ledger.seal({ agentId: 'builder', claim: 'c', payload: { a: 1 }, manifestHash: MANIFEST, missionRevision: 1 });
  ledger.seal({ agentId: 'auditor', claim: 'c', payload: { a: 1 }, manifestHash: MANIFEST, missionRevision: 1 });
  const receipts = new ReceiptChain();
  receipts.issueReceipt({
    missionId: 'mv', missionRevision: 1, manifestHash: MANIFEST,
    payloadHash: ledger.getChain()[0].payloadHash, createdBy: 'builder',
  });
  return { ledger, receipts };
}

describe('IndependentVerifier', () => {
  it('verifies an honest snapshot as valid', () => {
    // Arrange
    const { ledger, receipts } = fixture();
    const verifier = new IndependentVerifier(ledger.getChain(), receipts.exportReceipts());

    // Act
    const result = verifier.verifyLedger();

    // Assert
    expect(result.isValid).toBe(true);
    expect(result.invalidBlocks).toEqual([]);
  });

  it('detects a manipulated ledger copy as invalid (CONTRADICTED-level signal)', () => {
    // Arrange
    const { ledger, receipts } = fixture();
    const snapshot = ledger.getChain();
    const verifier = new IndependentVerifier(snapshot, receipts.exportReceipts());

    // Act — Kopie manipulieren (das Original bleibt unangetastet).
    const tamperedCopy = snapshot.map((b, i) => (i === 1 ? { ...b, claim: 'forged' } : b));
    const result = verifier.verifyLedger(tamperedCopy);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.invalidBlocks).toContain(1);
    // Original-Ledger ist weiterhin valide — Verifier arbeitet nur auf Kopien.
    expect(ledger.verifyChain().isValid).toBe(true);
  });

  it('attest() reports tampered receipt as CONTRADICTED and unknown subject as missing', () => {
    // Arrange
    const { ledger, receipts } = fixture();
    const exported = receipts.exportReceipts();
    const tampered = { ...exported[0], manifestHash: '0'.repeat(64) };
    const verifier = new IndependentVerifier(ledger.getChain(), [tampered]);

    // Act
    const contradicts = verifier.attest(tampered.receiptHash);
    const missing = verifier.attest('deadbeef'.repeat(8));

    // Assert
    expect(contradicts.verdict).toBe('CONTRADICTED');
    expect(missing.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
  });

  it('exposes no write access to ledger/receipts (API surface)', () => {
    // Arrange
    const { ledger, receipts } = fixture();
    const verifier = new IndependentVerifier(
      ledger.getChain(),
      receipts.exportReceipts()
    ) as unknown as Record<string, unknown>;

    // Act
    const writeLikeMethods = ['seal', 'issueReceipt', 'append', 'push', 'reset', 'mutate']
      .filter((name) => typeof verifier[name] === 'function');

    // Assert
    expect(writeLikeMethods).toEqual([]);
    expect(typeof verifier.verifyLedger).toBe('function');
    expect(typeof verifier.verifyReceiptBinding).toBe('function');
    expect(typeof verifier.attest).toBe('function');
  });

  it('verifyReceiptBinding rejects receipts bound to another manifest', () => {
    // Arrange
    const { receipts } = fixture();
    const receipt = receipts.exportReceipts()[0];
    const verifier = new IndependentVerifier([], [receipt]);

    // Act
    const wrongManifest = verifier.verifyReceiptBinding(receipt, {
      manifestHash: 'f'.repeat(64), missionId: 'mv', missionRevision: 1,
    });
    const rightManifest = verifier.verifyReceiptBinding(receipt, {
      manifestHash: MANIFEST, missionId: 'mv', missionRevision: 1,
    });

    // Assert
    expect(wrongManifest.bound).toBe(false);
    expect(rightManifest.bound).toBe(true);
  });
});
