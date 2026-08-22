import { describe, expect, it } from 'vitest';

import { deriveOperationSpec } from '../server/agents/gatekeeper';
import { sha256Hex } from '../server/evidence/canonicalJson';

const REV_A = 'a'.repeat(40);
const REV_B = 'b'.repeat(40);

describe('Gatekeeper Firestore operation specification', () => {
  it('binds consent to target and exact source revision without persisting raw mission text', () => {
    const rawGoal = 'Deploy customer secret 123 to production';
    const spec = deriveOperationSpec(
      {
        missionId: 'mission-1',
        missionRevision: 7,
        inputGoal: rawGoal,
      } as any,
      'proof-effects',
      REV_A,
    );

    expect(spec.kind).toBe('write');
    expect(spec.actionName).toBe('record_mission_proof');
    expect(spec.targetResource).toBe('firestore:proof-effects');
    expect(spec.parameters).toEqual({
      goalHash: sha256Hex(rawGoal),
      missionRevision: 7,
      sourceRevision: REV_A,
    });
    expect(JSON.stringify(spec)).not.toContain(rawGoal);
    expect(spec.operationId).toMatch(/^op-[a-f0-9]{20}$/);
  });

  it('changes operation identity when target collection changes', () => {
    const ctx = {
      missionId: 'mission-1',
      missionRevision: 1,
      inputGoal: 'same goal',
    } as any;

    const first = deriveOperationSpec(ctx, 'proof-effects-a', REV_A);
    const second = deriveOperationSpec(ctx, 'proof-effects-b', REV_A);

    expect(first.operationId).not.toBe(second.operationId);
    expect(first.parametersHash).toBe(second.parametersHash);
  });

  it('changes operation and parameter identity when source revision changes', () => {
    const ctx = {
      missionId: 'mission-1',
      missionRevision: 1,
      inputGoal: 'same goal',
    } as any;

    const first = deriveOperationSpec(ctx, 'proof-effects', REV_A);
    const second = deriveOperationSpec(ctx, 'proof-effects', REV_B);

    expect(first.parametersHash).not.toBe(second.parametersHash);
    expect(first.operationId).not.toBe(second.operationId);
  });

  it('binds a missing or malformed environment revision as null so the real executor remains unavailable', () => {
    const ctx = {
      missionId: 'mission-1',
      missionRevision: 1,
      inputGoal: 'same goal',
    } as any;

    const spec = deriveOperationSpec(ctx, 'proof-effects', null);
    expect(spec.parameters.sourceRevision).toBeNull();
  });
});
