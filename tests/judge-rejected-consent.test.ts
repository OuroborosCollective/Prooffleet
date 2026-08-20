import { describe, expect, it } from 'vitest';

import { EvidenceLedger, Judge, ReceiptChain, canonicalJson, sha256Hex } from '../server/evidence';

const MANIFEST = sha256Hex(canonicalJson({ missionId: 'reject-mission', revision: 1 }));

describe('Judge rejected-consent finalization semantics', () => {
  it('never returns VERIFIED for a finalized mission whose operator rejected the effect', () => {
    const ledger = new EvidenceLedger();
    const receipts = new ReceiptChain();
    const block = ledger.seal({
      agentId: 'auditor',
      claim: 'mission finalized',
      payload: {
        evidenceType: 'system_trace',
        missionId: 'reject-mission',
        missionRevision: 1,
        consentApproved: false,
        chainVerification: { isValid: true, brokenAt: null },
        receiptVerification: { isValid: true, brokenAt: null },
      },
      manifestHash: MANIFEST,
      missionRevision: 1,
    });
    receipts.issueReceipt({
      missionId: 'reject-mission',
      missionRevision: 1,
      manifestHash: MANIFEST,
      payloadHash: block.payloadHash,
      createdBy: 'auditor',
    });

    const verdict = Judge.judge(
      'mission finalized',
      ledger.getChain(),
      receipts.exportReceipts(),
    );

    expect(verdict.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
    expect(verdict.missingEvidence).toContain('approved_operation_effect');
    expect(verdict.rationale).toContain('Operator rejected');
  });
});
