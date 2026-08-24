import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/gemini', () => ({
  getGenAI: () => null,
}));

import { FleetRunner } from '../server/fleetRunner';

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, '../server.ts'), 'utf8');

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

function missionRoute(): string {
  const start = server.indexOf('app.post("/api/fleet/run"');
  const end = server.indexOf('// Server-Sent Events (SSE)', start);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('unable to isolate mission route');
  }
  return server.slice(start, end);
}

describe('FleetRunner single-active-mission invariant', () => {
  it('accepts exactly one of 25 concurrent starts and preserves one runtime owner', async () => {
    const runner = new FleetRunner();

    const results = await Promise.allSettled(
      Array.from({ length: 25 }, (_, index) =>
        runner.startMission(
          `concurrent mission ${index}`,
          `bounded goal ${index}`,
          'custom',
          'high_assurance',
          'HIGH',
          true,
        ),
      ),
    );

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<FleetRunner['startMission']>>> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(24);
    expect(runner.getMissionsRun()).toBe(1);
    expect(runner.getActiveMission()?.id).toBe(fulfilled[0].value.id);

    for (const result of rejected) {
      expect(result.reason).toMatchObject({ message: 'mission_already_active' });
    }

    await waitForStatus(fulfilled[0].value, 'paused_for_consent');
    expect(runner.getActiveMission()?.status).toBe('paused_for_consent');
  });

  it('keeps a paused-for-consent mission exclusive until it is terminal', async () => {
    const runner = new FleetRunner();
    const first = await runner.startMission(
      'exclusive mission',
      'pause at consent and retain runtime ownership',
      'custom',
      'high_assurance',
      'HIGH',
      true,
    );

    await waitForStatus(first, 'paused_for_consent');

    await expect(
      runner.startMission(
        'competing mission',
        'must not overlap the paused mission',
        'custom',
        'high_assurance',
        'HIGH',
        true,
      ),
    ).rejects.toThrow('mission_already_active');

    expect(runner.getMissionsRun()).toBe(1);
    expect(runner.getActiveMission()?.id).toBe(first.id);
  });

  it('maps the single-active-mission conflict to stable HTTP 409', () => {
    const route = missionRoute();

    expect(route).toContain('err.message === "mission_already_active"');
    expect(route).toContain('res.status(409)');
    expect(route).toContain('error: "mission_already_active"');
  });
});
