import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/gemini', () => ({
  getGenAI: () => null,
}));

import { FleetRunner } from '../server/fleetRunner';

async function waitForStatus(
  mission: { status: string },
  expected: string,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (mission.status === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`mission did not reach ${expected}; current=${mission.status}`);
}

describe('FleetRunner mission-scoped final judgment', () => {
  it('does not let a previous finalized mission contaminate the next mission verdict', async () => {
    const runner = new FleetRunner();

    const rejectedMission = await runner.startMission(
      'first mission',
      'Create a bounded proof effect, then reject it.',
      'custom',
      'high_assurance',
      'HIGH',
      true,
    );
    await waitForStatus(rejectedMission, 'paused_for_consent');

    const firstRequest = rejectedMission.consentRequests.at(-1);
    if (!firstRequest) throw new Error('first mission did not create consent request');
    const rejectedGrant = runner
      .getConsentEngine()
      .respond(firstRequest.requestId, 'REJECTED', 'owner', 'regression rejection');
    if (!rejectedGrant) throw new Error('failed to create rejected decision');

    const rejectedResult = await runner.resumeWithGrant(rejectedGrant);
    expect(rejectedResult?.status).toBe('failed');
    expect(rejectedResult?.finalVerdict?.judgeVerdict.verdict).toBe(
      'BLOCKED_BY_MISSING_EVIDENCE',
    );

    const approvedButUnprovisioned = await runner.startMission(
      'second mission',
      'Create another bounded proof effect with approval but no cloud executor.',
      'custom',
      'high_assurance',
      'HIGH',
      true,
    );
    await waitForStatus(approvedButUnprovisioned, 'paused_for_consent');

    const secondRequest = approvedButUnprovisioned.consentRequests.at(-1);
    if (!secondRequest) throw new Error('second mission did not create consent request');
    const approvedGrant = runner
      .getConsentEngine()
      .respond(secondRequest.requestId, 'APPROVED', 'owner', 'regression approval');
    if (!approvedGrant) throw new Error('failed to create approved decision');

    const secondResult = await runner.resumeWithGrant(approvedGrant);

    expect(secondResult?.status).toBe('failed');
    expect(secondResult?.finalVerdict?.judgeVerdict.verdict).toBe(
      'BLOCKED_BY_MISSING_EVIDENCE',
    );
    expect(secondResult?.finalVerdict?.judgeVerdict.contradictions ?? []).toEqual([]);
    expect(secondResult?.finalVerdict?.judgeVerdict.missingEvidence).toContain(
      'external_effect_readback',
    );
  });
});
