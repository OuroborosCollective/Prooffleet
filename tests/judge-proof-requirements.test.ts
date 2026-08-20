import { describe, expect, it } from 'vitest';

import { EvidenceLedger, Judge, ReceiptChain, canonicalJson, sha256Hex } from '../server/evidence/index';

const MANIFEST = sha256Hex(canonicalJson({ missionId: 'mj', revision: 1 }));

function sealWithReceipt(
  ledger: EvidenceLedger,
  receipts: ReceiptChain,
  agentId: string,
  claim: string,
  payload: Record<string, unknown>,
) {
  const block = ledger.seal({
    agentId,
    claim,
    payload,
    manifestHash: MANIFEST,
    missionRevision: 1,
  });
  receipts.issueReceipt({
    missionId: 'mj',
    missionRevision: 1,
    manifestHash: MANIFEST,
    payloadHash: block.payloadHash,
    createdBy: agentId as any,
  });
  return block;
}

function finalize(ledger: EvidenceLedger, receipts: ReceiptChain) {
  sealWithReceipt(ledger, receipts, 'auditor', 'mission finalized', {
    evidenceType: 'system_trace',
    ok: true,
  });
}

describe('Judge authoritative proof requirements', () => {
  it('blocks hash-valid AGENT_OUTPUT when runtime proof is required', () => {
    const ledger = new EvidenceLedger();
    const receipts = new ReceiptChain();
    finalize(ledger, receipts);
    sealWithReceipt(ledger, receipts, 'operator', 'operation executed via executor', {
      evidenceType: 'operation_result',
      assertion: 'OBSERVED',
      sourceKind: 'AGENT_OUTPUT',
      operationId: 'op-1',
    });

    const verdict = Judge.judge('mission finalized', ledger.getChain(), receipts.exportReceipts(), [
      {
        requirementId: 'external_effect_readback',
        evidenceType: 'operation_result',
        allowedSourceKinds: ['CLOUD_RUN_READBACK'],
        runtimeRequired: true,
        operationId: 'op-1',
      },
    ]);

    expect(verdict.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
    expect(verdict.missingEvidence).toContain('external_effect_readback');
  });

  it('verifies matching operation-bound authoritative Cloud Run readback', () => {
    const ledger = new EvidenceLedger();
    const receipts = new ReceiptChain();
    finalize(ledger, receipts);
    sealWithReceipt(ledger, receipts, 'operator', 'operation executed via executor', {
      evidenceType: 'operation_result',
      assertion: 'OBSERVED',
      sourceKind: 'CLOUD_RUN_READBACK',
      operationId: 'op-1',
      deploymentRevision: 'rev-42',
    });

    const verdict = Judge.judge('mission finalized', ledger.getChain(), receipts.exportReceipts(), [
      {
        requirementId: 'external_effect_readback',
        evidenceType: 'operation_result',
        allowedSourceKinds: ['CLOUD_RUN_READBACK'],
        runtimeRequired: true,
        operationId: 'op-1',
        deploymentRevision: 'rev-42',
      },
    ]);

    expect(verdict.verdict).toBe('VERIFIED');
  });

  it('turns an authoritative contradiction into CONTRADICTED', () => {
    const ledger = new EvidenceLedger();
    const receipts = new ReceiptChain();
    finalize(ledger, receipts);
    sealWithReceipt(ledger, receipts, 'operator', 'operation executed via executor', {
      evidenceType: 'operation_result',
      assertion: 'CONTRADICTED',
      sourceKind: 'CLOUD_RUN_READBACK',
      operationId: 'op-1',
    });

    const verdict = Judge.judge('mission finalized', ledger.getChain(), receipts.exportReceipts(), [
      {
        requirementId: 'external_effect_readback',
        evidenceType: 'operation_result',
        allowedSourceKinds: ['CLOUD_RUN_READBACK'],
        runtimeRequired: true,
        operationId: 'op-1',
      },
    ]);

    expect(verdict.verdict).toBe('CONTRADICTED');
  });

  it('never lets STATIC_CANDIDATE satisfy runtime-required proof', () => {
    const ledger = new EvidenceLedger();
    const receipts = new ReceiptChain();
    finalize(ledger, receipts);
    sealWithReceipt(ledger, receipts, 'analyst', 'static candidate', {
      evidenceType: 'operation_result',
      assertion: 'OBSERVED',
      sourceKind: 'STATIC_CANDIDATE',
      operationId: 'op-1',
    });

    const verdict = Judge.judge('mission finalized', ledger.getChain(), receipts.exportReceipts(), [
      {
        requirementId: 'external_effect_readback',
        evidenceType: 'operation_result',
        allowedSourceKinds: ['STATIC_CANDIDATE'],
        runtimeRequired: true,
        operationId: 'op-1',
      },
    ]);

    expect(verdict.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
  });
});
