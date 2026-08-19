/**
 * tests/consent.test.ts — operation-bound consent, kein Auto-Approve (SPEC §3/§7).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence/canonicalJson';
import type { OperationSpec } from '../src/types/index';

const here = path.dirname(fileURLToPath(import.meta.url));

function makeSpec(overrides: Partial<OperationSpec> = {}): OperationSpec {
  const parameters = { goal: 'deploy artifact', ...overrides.parameters };
  return {
    operationId: 'op-test-1',
    kind: 'write',
    actionName: 'deploy_mission_artifacts',
    targetResource: 'mission-artifact-store',
    parameters,
    parametersHash: sha256Hex(canonicalJson(parameters)),
    missionId: 'mission-test',
    missionRevision: 1,
    ...overrides,
  };
}

describe('ConsentEngine', () => {
  it('binds a grant to exactly one OperationSpec (spec A grant invalid for spec B)', () => {
    // Arrange
    const engine = new ConsentEngine();
    const specA = makeSpec();
    const specB = makeSpec({ operationId: 'op-test-2', parameters: { goal: 'other' } });
    const request = engine.createRequest(specA, 'HIGH', 'needs approval');

    // Act
    const grant = engine.respond(request.requestId, 'APPROVED', 'operator-1');
    expect(grant).not.toBeNull();
    const validA = engine.validateGrantForOperation(grant!, specA);
    const validB = engine.validateGrantForOperation(grant!, specB);

    // Assert
    expect(validA.valid).toBe(true);
    expect(validB.valid).toBe(false);
    expect(validB.reason).toMatch(/operationHash mismatch/);
  });

  it('never auto-approves: source contains no timer-based approval path', () => {
    // Arrange
    const source = readFileSync(
      path.join(here, '../server/consent/consentEngine.ts'),
      'utf8'
    );

    // Act
    const hasSetTimeoutApprove = /setTimeout[\s\S]{0,200}APPROVED/.test(source);
    const hasAutoValidated = source.includes('Auto-Validated');
    const hasAnySetTimeout = /setTimeout\s*\(/.test(source);

    // Assert
    expect(hasSetTimeoutApprove).toBe(false);
    expect(hasAutoValidated).toBe(false);
    expect(hasAnySetTimeout).toBe(false);
  });

  it('keeps a request PENDING forever without an explicit respond() call', async () => {
    // Arrange
    let clock = 1_000_000;
    const engine = new ConsentEngine({ now: () => clock });
    const request = engine.createRequest(makeSpec(), 'LOW', 'test');

    // Act — Zeit vergeht, niemand antwortet.
    clock += 60 * 60 * 1000;
    await new Promise((r) => setImmediate(r));

    // Assert
    expect(engine.getRequest(request.requestId)?.status).toBe('PENDING');
    expect(engine.getPendingRequests().map((r) => r.requestId)).toContain(request.requestId);
  });

  it('rejects an expired grant', () => {
    // Arrange
    let clock = 1_000_000;
    const engine = new ConsentEngine({ now: () => clock, grantTtlMs: 1000 });
    const spec = makeSpec();
    const request = engine.createRequest(spec, 'MEDIUM', 'ttl test');
    const grant = engine.respond(request.requestId, 'APPROVED', 'operator-1')!;

    // Act — nach Ablauf der TTL.
    clock += 2000;
    const validation = engine.validateGrantForOperation(grant, spec);

    // Assert
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/expired/);
  });

  it('treats a REJECTED grant as invalid for execution', () => {
    // Arrange
    const engine = new ConsentEngine();
    const spec = makeSpec();
    const request = engine.createRequest(spec, 'CRITICAL', 'reject test');

    // Act
    const grant = engine.respond(request.requestId, 'REJECTED', 'operator-2', 'too risky')!;
    const validation = engine.validateGrantForOperation(grant, spec);

    // Assert
    expect(grant.decision).toBe('REJECTED');
    expect(validation.valid).toBe(false);
    expect(validation.reason).toMatch(/REJECTED/);
  });

  it('does not decide twice and never decides without operator identity', () => {
    // Arrange
    const engine = new ConsentEngine();
    const spec = makeSpec();
    const request = engine.createRequest(spec, 'LOW', 'double test');

    // Act
    const anonymous = engine.respond(request.requestId, 'APPROVED', '   ');
    const first = engine.respond(request.requestId, 'APPROVED', 'operator-1');
    const second = engine.respond(request.requestId, 'REJECTED', 'operator-2');

    // Assert
    expect(anonymous).toBeNull();
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(engine.getRequest(request.requestId)?.status).toBe('APPROVED');
  });
});
