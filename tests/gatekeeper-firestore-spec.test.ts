import { describe, expect, it } from 'vitest';

import { deriveOperationSpec } from '../server/agents/gatekeeper';
import { sha256Hex } from '../server/evidence/canonicalJson';

describe('Gatekeeper Firestore operation specification', () => {
  it('binds consent to the configured Firestore target without persisting raw mission text', () => {
    const rawGoal = 'Deploy customer secret 123 to production';
    const spec = deriveOperationSpec(
      {
        missionId: 'mission-1',
        missionRevision: 7,
        inputGoal: rawGoal,
      } as any,
      'proof-effects',
    );

    expect(spec.kind).toBe('write');
    expect(spec.actionName).toBe('record_mission_proof');
    expect(spec.targetResource).toBe('firestore:proof-effects');
    expect(spec.parameters).toEqual({
      goalHash: sha256Hex(rawGoal),
      missionRevision: 7,
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

    const first = deriveOperationSpec(ctx, 'proof-effects-a');
    const second = deriveOperationSpec(ctx, 'proof-effects-b');

    expect(first.operationId).not.toBe(second.operationId);
    expect(first.parametersHash).toBe(second.parametersHash);
  });
});
