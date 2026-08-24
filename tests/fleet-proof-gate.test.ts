import { describe, expect, it } from 'vitest';

import { FleetRunner } from '../server/fleetRunner';
import { canonicalJson, sha256Hex } from '../server/evidence';
import type { Mission, OperationSpec } from '../src/types';

function manifestHash(mission: Mission) {
  return sha256Hex(
    canonicalJson({
      missionId: mission.id,
      inputGoal: mission.inputGoal,
      requireConsentForWrite: mission.requireConsentForWrite,
      missionRevision: 1,
    }),
  );
}

function bareMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-test',
    title: 'Proof gate',
    description: 'prove an external effect',
    inputGoal: 'prove an external effect',
    presetKey: 'custom',
    strictness: 'high_assurance',
    thinkingLevel: 'HIGH',
    requireConsentForWrite: false,
    status: 'running',
    startedAt: new Date(0).toISOString(),
    steps: [],
    evidenceChain: [],
    consentRequests: [],
    ...overrides,
  };
}

describe('Fleet final proof gate', () => {
  it('does not let requireConsentForWrite=false bypass authoritative proof', () => {
    const runner = new FleetRunner();
    const mission = bareMission({ requireConsentForWrite: false });

    (runner as any).finalizeMission(mission, manifestHash(mission), 1, true);

    expect(mission.status).toBe('failed');
    expect(mission.finalVerdict?.judgeVerdict.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
    expect(mission.finalVerdict?.judgeVerdict.missingEvidence).toContain('operation_spec_required');
    expect(mission.finalVerdict?.compliancePassed).toBe(false);
  });

  it('completes only when the planned operation has matching authoritative runtime readback', () => {
    const runner = new FleetRunner();
    const mission = bareMission({ requireConsentForWrite: true });
    const spec: OperationSpec = {
      operationId: 'op-cloud-run-1',
      kind: 'write',
      actionName: 'deploy_service',
      targetResource: 'cloud-run:prooffleet-demo',
      parameters: { image: 'sha256:abc' },
      parametersHash: sha256Hex(canonicalJson({ image: 'sha256:abc' })),
      missionId: mission.id,
      missionRevision: 1,
    };
    mission.consentRequests.push({
      requestId: 'req-1',
      operationHash: sha256Hex(canonicalJson(spec)),
      operationId: spec.operationId,
      parametersHash: spec.parametersHash,
      missionId: mission.id,
      missionRevision: 1,
      spec,
      riskLevel: 'HIGH',
      justification: 'test',
      status: 'APPROVED',
      requestedAt: new Date(0).toISOString(),
    });

    const hash = manifestHash(mission);
    const block = runner.getLedger().seal({
      agentId: 'operator',
      claim: 'operation executed via executor',
      payload: {
        evidenceType: 'operation_result',
        assertion: 'OBSERVED',
        sourceKind: 'CLOUD_RUN_READBACK',
        operationId: spec.operationId,
        deploymentRevision: 'prooffleet-00042',
        readbackEvidence: { activeRevision: 'prooffleet-00042' },
      },
      manifestHash: hash,
      missionRevision: 1,
    });
    runner.getReceiptChain().issueReceipt({
      missionId: mission.id,
      missionRevision: 1,
      manifestHash: hash,
      payloadHash: block.payloadHash,
      createdBy: 'operator',
    });

    (runner as any).finalizeMission(mission, hash, 1, true);

    expect(mission.status).toBe('completed');
    expect(mission.finalVerdict?.judgeVerdict.verdict).toBe('VERIFIED');
    expect(mission.finalVerdict?.compliancePassed).toBe(true);
  });
});
