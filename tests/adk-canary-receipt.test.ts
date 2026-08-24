import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyAdkCanaryReceipt } from '../scripts/verify-adk-canary-receipt.mjs';

const SOURCE = 'a'.repeat(40);

function receipt(overrides = {}) {
  const body = {
    schemaVersion: 'prooffleet.adk-wif-canary.v1',
    outcome: 'OBSERVED',
    sourceRevision: SOURCE,
    candidateRevision: 'prooffleet-00001',
    candidateUrlSha256: 'b'.repeat(64),
    ...overrides,
  };
  return {
    ...body,
    receiptHash: createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex'),
  };
}

describe('ADK canary upload receipt verification', () => {
  it('accepts only an observed receipt bound to the exact source revision', () => {
    const verified = verifyAdkCanaryReceipt(receipt(), SOURCE);
    expect(verified.sourceRevision).toBe(SOURCE);
    expect(verified.receiptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blocks wrong source, non-observed outcome, malformed hashes and mutation after hashing', () => {
    expect(() => verifyAdkCanaryReceipt(receipt({ sourceRevision: 'c'.repeat(40) }), SOURCE))
      .toThrow(/source revision/);
    expect(() => verifyAdkCanaryReceipt(receipt({ outcome: 'PROVIDER_READY' }), SOURCE))
      .toThrow(/outcome is not OBSERVED/);
    expect(() => verifyAdkCanaryReceipt({ ...receipt(), receiptHash: 'not-a-hash' }, SOURCE))
      .toThrow(/hash is malformed/);

    const mutated = receipt();
    mutated.candidateRevision = 'prooffleet-mutated';
    expect(() => verifyAdkCanaryReceipt(mutated, SOURCE))
      .toThrow(/hash does not match/);
  });
});
