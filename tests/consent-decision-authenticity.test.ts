import { describe, expect, it } from 'vitest';

import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence/canonicalJson';
import type { ConsentGrant, OperationSpec } from '../src/types';

function makeSpec(operationId = 'op-consent-auth'): OperationSpec {
  const parameters = { effect: 'record-proof' };
  return {
    operationId,
    kind: 'write',
    actionName: 'record_proof',
    targetResource: 'firestore:proof-effects',
    parameters,
    parametersHash: sha256Hex(canonicalJson(parameters)),
    missionId: 'mission-consent-auth',
    missionRevision: 1,
  };
}

describe('ConsentEngine decision authenticity', () => {
  it('accepts an engine-issued REJECTED decision as authentic but never as execution authorization', () => {
    const engine = new ConsentEngine();
    const spec = makeSpec();
    const request = engine.createRequest(spec, 'HIGH', 'human decision required');
    const rejected = engine.respond(request.requestId, 'REJECTED', 'owner', 'too risky');
    if (!rejected) throw new Error('expected rejected decision');

    expect(engine.validateDecisionForOperation(rejected, spec)).toEqual({
      valid: true,
      reason: 'decision authentic and bound to this operation',
    });
    const executionValidation = engine.validateGrantForOperation(rejected, spec);
    expect(executionValidation.valid).toBe(false);
    expect(executionValidation.reason).toContain('REJECTED');
  });

  it('rejects a forged requestId even when operationHash and other fields look valid', () => {
    const engine = new ConsentEngine();
    const spec = makeSpec('op-forged-request');
    const request = engine.createRequest(spec, 'HIGH', 'human decision required');
    const approved = engine.respond(request.requestId, 'APPROVED', 'owner', 'approved');
    if (!approved) throw new Error('expected approved decision');

    const forged: ConsentGrant = {
      ...approved,
      requestId: 'request-never-issued-by-this-engine',
    };

    const validation = engine.validateDecisionForOperation(forged, spec);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('not issued by this ConsentEngine');
  });

  it('rejects forged operator identity on an otherwise engine-issued decision', () => {
    const engine = new ConsentEngine();
    const spec = makeSpec('op-forged-operator');
    const request = engine.createRequest(spec, 'HIGH', 'human decision required');
    const approved = engine.respond(request.requestId, 'APPROVED', 'owner', 'approved');
    if (!approved) throw new Error('expected approved decision');

    const forged: ConsentGrant = {
      ...approved,
      operatorIdentity: 'attacker',
    };

    const validation = engine.validateDecisionForOperation(forged, spec);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('operatorIdentity');
  });
});
