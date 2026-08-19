/**
 * tests/ops.test.ts — OperationExecutor: Idempotency, Readback-before-retry,
 * Consent-Gate (SPEC §3/§7).
 *
 * Fake-Handler/Test-Doubles sind NUR in diesem Testverzeichnis erlaubt
 * (SPEC: "Test-Doubles/Mocks nur unter tests/").
 */
import { describe, it, expect } from 'vitest';

import { OperationExecutor, type OperationHandler } from '../server/ops/operationExecutor';
import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence/canonicalJson';
import type { OperationSpec } from '../src/types/index';

function makeSpec(overrides: Partial<OperationSpec> = {}): OperationSpec {
  const parameters = { key: 'value' };
  return {
    operationId: 'op-1',
    kind: 'write',
    actionName: 'write_config',
    targetResource: 'config-store',
    parameters,
    parametersHash: sha256Hex(canonicalJson(parameters)),
    missionId: 'mission-ops',
    missionRevision: 1,
    ...overrides,
  };
}

/** Test-Double (nur tests/): zaehlt apply/readback-Aufrufe, steuerbarer Zustand. */
function fakeHandler(initialApplied: boolean) {
  let applied = initialApplied;
  const calls = { apply: 0, readback: 0 };
  const handler: OperationHandler = {
    async apply() {
      calls.apply += 1;
      applied = true;
      return { ok: true };
    },
    async readback() {
      calls.readback += 1;
      return applied ? { applied: true } : null;
    },
  };
  return { handler, calls };
}

function approvedGrantFor(engine: ConsentEngine, spec: OperationSpec) {
  const req = engine.createRequest(spec, 'LOW', 'test');
  return engine.respond(req.requestId, 'APPROVED', 'operator-1')!;
}

describe('OperationExecutor', () => {
  it('is idempotent: second execute() with same operationId never re-applies', async () => {
    // Arrange
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, sleep: async () => {} });
    const spec = makeSpec();
    const grant = approvedGrantFor(consent, spec);
    const { handler, calls } = fakeHandler(false);

    // Act
    const first = await executor.execute(spec, handler, grant);
    const second = await executor.execute(spec, handler, grant);

    // Assert
    expect(first.status).toBe('applied');
    expect(second).toEqual(first);
    expect(calls.apply).toBe(1);
  });

  it('readback-before-retry: target state already present -> already_applied, apply 0x', async () => {
    // Arrange
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, sleep: async () => {} });
    const spec = makeSpec({ operationId: 'op-already' });
    const grant = approvedGrantFor(consent, spec);
    const { handler, calls } = fakeHandler(true); // Readback zeigt Zielzustand sofort

    // Act
    const result = await executor.execute(spec, handler, grant);

    // Assert
    expect(result.status).toBe('already_applied');
    expect(result.readbackEvidence).toEqual({ applied: true });
    expect(calls.apply).toBe(0);
    expect(calls.readback).toBeGreaterThanOrEqual(1);
  });

  it('blocks write without a grant: blocked_consent_required, apply 0x', async () => {
    // Arrange
    const executor = new OperationExecutor({ sleep: async () => {} });
    const spec = makeSpec({ operationId: 'op-no-consent' });
    const { handler, calls } = fakeHandler(false);

    // Act
    const result = await executor.execute(spec, handler);

    // Assert
    expect(result.status).toBe('blocked_consent_required');
    expect(result.attempts).toBe(0);
    expect(calls.apply).toBe(0);
    expect(calls.readback).toBe(0);
  });

  it('blocks write with a grant bound to a different operation', async () => {
    // Arrange
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, sleep: async () => {} });
    const spec = makeSpec({ operationId: 'op-mismatch' });
    const otherSpec = makeSpec({ operationId: 'op-other', parameters: { key: 'other' } });
    const wrongGrant = approvedGrantFor(consent, otherSpec);
    const { handler, calls } = fakeHandler(false);

    // Act
    const result = await executor.execute(spec, handler, wrongGrant);

    // Assert
    expect(result.status).toBe('blocked_consent_required');
    expect(calls.apply).toBe(0);
  });

  it('concurrency: 50 parallel execute() with same operationId -> apply exactly 1x', async () => {
    // Arrange — Handler mit künstlicher Verzögerung, damit die Aufrufe
    // sich echt überlappen (sonst wäre der Cache-Treffer trivial).
    const consent = new ConsentEngine();
    const executor = new OperationExecutor({ grantValidator: consent, sleep: async () => {} });
    const spec = makeSpec({ operationId: 'op-concurrent' });
    const grant = approvedGrantFor(consent, spec);
    let applied = false;
    const calls = { apply: 0, readback: 0 };
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
    const handler: OperationHandler = {
      async apply() {
        await slow();
        calls.apply += 1;
        applied = true;
        return { ok: true };
      },
      async readback() {
        await slow();
        calls.readback += 1;
        return applied ? { applied: true } : null;
      },
    };

    // Act — 50 parallele Ausführungen mit identischer operationId.
    const results = await Promise.all(
      Array.from({ length: 50 }, () => executor.execute(spec, handler, grant)),
    );

    // Assert — apply lief exakt einmal; alle Aufrufer erhalten dasselbe Result.
    expect(calls.apply).toBe(1);
    for (const r of results) {
      expect(r).toEqual(results[0]);
      expect(r.status).toBe('applied');
    }
    // Nach Abschluss liegt das Result in der Idempotency-Map.
    expect(executor.getResult('op-concurrent')).toEqual(results[0]);
  });

  it('read operations need no grant and return readback evidence', async () => {
    // Arrange
    const executor = new OperationExecutor({ sleep: async () => {} });
    const spec = makeSpec({ operationId: 'op-read', kind: 'read' });
    const { handler } = fakeHandler(true);

    // Act
    const result = await executor.execute(spec, handler);

    // Assert
    expect(result.status).toBe('applied');
    expect(result.readbackEvidence).toEqual({ applied: true });
  });
});
