import { describe, expect, it } from 'vitest';

import { ConsentEngine } from '../server/consent/consentEngine';
import { OperationExecutor, type OperationHandler } from '../server/ops/operationExecutor';
import { canonicalJson, sha256Hex } from '../server/evidence';
import type { OperationSpec } from '../src/types';

function makeSpec(operationId = 'op-readback-guard'): OperationSpec {
  const parameters = { effect: 'record-proof' };
  return {
    operationId,
    kind: 'write',
    actionName: 'record_proof',
    targetResource: 'firestore:proof-effects',
    parameters,
    parametersHash: sha256Hex(canonicalJson(parameters)),
    missionId: 'mission-readback-guard',
    missionRevision: 1,
  };
}

function approvedGrant(engine: ConsentEngine, spec: OperationSpec) {
  const request = engine.createRequest(spec, 'HIGH', 'regression');
  const grant = engine.respond(request.requestId, 'APPROVED', 'owner', 'approved');
  if (!grant) throw new Error('expected grant');
  return grant;
}

describe('OperationExecutor fail-closed readback semantics', () => {
  it('never calls apply when pre-write readback is unavailable', async () => {
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, maxAttempts: 3, sleep: async () => {} });
    const spec = makeSpec('op-readback-error');
    const grant = approvedGrant(consent, spec);
    let applyCalls = 0;
    let readbackCalls = 0;
    const handler: OperationHandler = {
      async apply() {
        applyCalls += 1;
      },
      async readback() {
        readbackCalls += 1;
        throw new Error('provider unavailable');
      },
    };

    const result = await executor.execute(spec, handler, grant);

    expect(result.status).toBe('failed');
    expect(applyCalls).toBe(0);
    expect(readbackCalls).toBe(3);
    expect(result.error).toContain('readback failed');
  });

  it('never overwrites an existing operationId with conflicting identity', async () => {
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, sleep: async () => {} });
    const spec = makeSpec('op-conflict');
    const grant = approvedGrant(consent, spec);
    let applyCalls = 0;
    const handler: OperationHandler = {
      async apply() {
        applyCalls += 1;
      },
      async readback() {
        return {
          applied: false,
          conflict: true,
          observedOperationId: spec.operationId,
          observedParametersHash: 'different-hash',
        };
      },
    };

    const result = await executor.execute(spec, handler, grant);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('readback conflict');
    expect(applyCalls).toBe(0);
  });

  it('fails immediately when post-apply readback reports an identity conflict', async () => {
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, sleep: async () => {} });
    const spec = makeSpec('op-post-conflict');
    const grant = approvedGrant(consent, spec);
    let applyCalls = 0;
    let readbackCalls = 0;
    const handler: OperationHandler = {
      async apply() {
        applyCalls += 1;
      },
      async readback() {
        readbackCalls += 1;
        if (readbackCalls === 1) return null;
        return { applied: false, conflict: true, observedOperationId: spec.operationId };
      },
    };

    const result = await executor.execute(spec, handler, grant);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('post-apply readback conflict');
    expect(applyCalls).toBe(1);
    expect(readbackCalls).toBe(2);
  });
});
