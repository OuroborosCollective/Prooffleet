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
    expect(executor.getResult(spec.operationId)).toBeUndefined();
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
    expect(executor.getResult(spec.operationId)).toBeUndefined();
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
    expect(executor.getResult(spec.operationId)).toBeUndefined();
  });

  it('allows the same operationId after consent is granted later', async () => {
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, sleep: async () => {} });
    const spec = makeSpec('op-consent-recovery');
    let applied = false;
    let applyCalls = 0;
    const handler: OperationHandler = {
      async apply() {
        applyCalls += 1;
        applied = true;
      },
      async readback() {
        return applied ? { applied: true, sourceKind: 'FIRESTORE_READBACK' } : null;
      },
    };

    const blocked = await executor.execute(spec, handler);
    expect(blocked.status).toBe('blocked_consent_required');
    expect(applyCalls).toBe(0);
    expect(executor.getResult(spec.operationId)).toBeUndefined();

    const grant = approvedGrant(consent, spec);
    const recovered = await executor.execute(spec, handler, grant);

    expect(recovered.status).toBe('applied');
    expect(applyCalls).toBe(1);
    expect(executor.getResult(spec.operationId)?.status).toBe('applied');
  });

  it('allows the same operationId after a transient readback outage recovers', async () => {
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, maxAttempts: 2, sleep: async () => {} });
    const spec = makeSpec('op-provider-recovery');
    const grant = approvedGrant(consent, spec);
    let providerAvailable = false;
    let applied = false;
    let applyCalls = 0;
    const handler: OperationHandler = {
      async apply() {
        applyCalls += 1;
        applied = true;
      },
      async readback() {
        if (!providerAvailable) throw new Error('provider unavailable');
        return applied ? { applied: true, sourceKind: 'FIRESTORE_READBACK' } : null;
      },
    };

    const first = await executor.execute(spec, handler, grant);
    expect(first.status).toBe('failed');
    expect(applyCalls).toBe(0);
    expect(executor.getResult(spec.operationId)).toBeUndefined();

    providerAvailable = true;
    const second = await executor.execute(spec, handler, grant);

    expect(second.status).toBe('applied');
    expect(applyCalls).toBe(1);
    expect(executor.getResult(spec.operationId)?.status).toBe('applied');
  });
});
