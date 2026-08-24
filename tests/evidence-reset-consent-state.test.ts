import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence/canonicalJson';
import type { OperationSpec } from '../src/types/index';

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, '../server.ts'), 'utf8');

function makeSpec(): OperationSpec {
  const parameters = { target: 'proof-state' };
  return {
    operationId: 'op-reset-consent-1',
    kind: 'write',
    actionName: 'mutate_proof_state',
    targetResource: 'proof-state',
    parameters,
    parametersHash: sha256Hex(canonicalJson(parameters)),
    missionId: 'mission-before-reset',
    missionRevision: 1,
  };
}

function resetRoute(): string {
  const start = server.indexOf('app.post("/api/evidence/reset"');
  const end = server.indexOf('// Judge: read-only evaluation', start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('unable to isolate evidence reset route');
  }
  return server.slice(start, end);
}

describe('evidence reset consent-state invalidation', () => {
  it('removes pending consent requests instead of leaving stale operator work after reset', () => {
    const engine = new ConsentEngine();
    const request = engine.createRequest(makeSpec(), 'HIGH', 'pre-reset authority');

    expect(engine.getPendingRequests().map((item) => item.requestId)).toContain(request.requestId);

    engine.clearRequests();

    expect(engine.getPendingRequests()).toEqual([]);
    expect(engine.getAllRequests()).toEqual([]);
    expect(engine.getRequest(request.requestId)).toBeUndefined();
  });

  it('invalidates a previously issued grant identity after the reset boundary', () => {
    const engine = new ConsentEngine();
    const spec = makeSpec();
    const request = engine.createRequest(spec, 'CRITICAL', 'pre-reset authority');
    const grant = engine.respond(request.requestId, 'APPROVED', 'operator-reset-test');

    expect(grant).not.toBeNull();
    expect(engine.validateGrantForOperation(grant!, spec).valid).toBe(true);

    engine.clearRequests();

    const validation = engine.validateGrantForOperation(grant!, spec);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/not issued by this ConsentEngine/);
  });

  it('clears consent authority in the authenticated destructive reset route', () => {
    const route = resetRoute();
    const resetIndex = route.indexOf('fleetRunner.resetEvidence()');
    const clearIndex = route.indexOf('fleetRunner.getConsentEngine().clearRequests()');
    const successIndex = route.indexOf('success: true');

    expect(resetIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeGreaterThan(resetIndex);
    expect(successIndex).toBeGreaterThan(clearIndex);
  });
});
