/**
 * tests/evidence.test.ts — Receipt-Binding, Tamper-Erkennung, MemoryStore-
 * Trennung (SPEC §2/§7).
 */
import { describe, it, expect } from 'vitest';

import {
  EvidenceLedger,
  ReceiptChain,
  MemoryStore,
  canonicalJson,
  sha256Hex,
  type EvidenceBlock,
} from '../server/evidence/index';

const MANIFEST = sha256Hex(canonicalJson({ missionId: 'm1', revision: 1 }));

function sealSample(ledger: EvidenceLedger, claim = 'c1') {
  return ledger.seal({
    agentId: 'builder',
    claim,
    payload: { value: 42 },
    manifestHash: MANIFEST,
    missionRevision: 1,
  });
}

describe('ReceiptChain', () => {
  it('binds receipts to manifestHash + missionRevision', () => {
    // Arrange
    const chain = new ReceiptChain();
    const ledger = new EvidenceLedger();
    const block = sealSample(ledger);

    // Act
    const receipt = chain.issueReceipt({
      missionId: 'm1',
      missionRevision: 1,
      manifestHash: MANIFEST,
      payloadHash: block.payloadHash,
      createdBy: 'builder',
    });

    // Assert
    expect(receipt.manifestHash).toBe(MANIFEST);
    expect(receipt.missionRevision).toBe(1);
    expect(receipt.payloadHash).toBe(block.payloadHash);
    expect(chain.verifyReceipt(receipt)).toBe(true);
  });

  it('detects a tampered receipt via verifyChain -> isValid=false', () => {
    // Arrange
    const chain = new ReceiptChain();
    const r1 = chain.issueReceipt({
      missionId: 'm1', missionRevision: 1, manifestHash: MANIFEST,
      payloadHash: 'a'.repeat(64), createdBy: 'auditor',
    });
    chain.issueReceipt({
      missionId: 'm1', missionRevision: 1, manifestHash: MANIFEST,
      payloadHash: 'b'.repeat(64), createdBy: 'auditor',
    });

    // Act — Export kopieren und das erste Receipt manipulieren.
    const tampered = chain.exportReceipts();
    tampered[0] = { ...tampered[0], payloadHash: 'f'.repeat(64) };
    const result = chain.verifyChain(tampered);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.brokenAt).toBe(r1.receiptId);
  });
});

describe('EvidenceLedger', () => {
  it('detects a manipulated block via verifyChain -> isValid=false', () => {
    // Arrange
    const ledger = new EvidenceLedger();
    sealSample(ledger, 'c1');
    const second = sealSample(ledger, 'c2');

    // Act — Snapshot manipulieren (Payload austauschen, Hash beibehalten).
    const tampered: EvidenceBlock[] = ledger.getChain();
    tampered[1] = { ...second, payload: { value: 999 } };
    const result = ledger.verifyChain(tampered);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('accepts an untampered chain', () => {
    // Arrange
    const ledger = new EvidenceLedger();
    sealSample(ledger, 'c1');
    sealSample(ledger, 'c2');

    // Act
    const result = ledger.verifyChain();

    // Assert
    expect(result.isValid).toBe(true);
    expect(result.brokenAt).toBeNull();
  });
});

describe('MemoryStore', () => {
  it('memory entries are structurally unsealable (no evidence fields)', () => {
    // Arrange
    const store = new MemoryStore();
    const entry = store.set('scout', 'note', { text: 'agent scratch note' });

    // Act + Assert — ein MemoryEntry traegt keinerlei Evidence-Bindungsfelder.
    expect(entry.kind).toBe('memory');
    expect('blockHash' in entry).toBe(false);
    expect('manifestHash' in entry).toBe(false);
    expect('blockIndex' in entry).toBe(false);
    // Runtime-Guard akzeptiert echte Memory-Eintraege ...
    expect(() => MemoryStore.assertNotEvidence(entry)).not.toThrow();
    // ... und lehnt alles ab, was Evidence-Felder traegt.
    expect(() =>
      MemoryStore.assertNotEvidence({ ...entry, blockHash: 'x'.repeat(64) })
    ).toThrow();
  });
});
