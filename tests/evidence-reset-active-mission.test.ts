import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, '../server.ts'), 'utf8');
const app = readFileSync(join(here, '../src/App.tsx'), 'utf8');
const httpE2e = readFileSync(join(here, '../scripts/verify-consent-http-e2e.mjs'), 'utf8');

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`unable to isolate source block: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

describe('active-mission evidence reset invariant', () => {
  it('rejects reset while runtime ownership is running or paused before any destructive mutation', () => {
    const route = between(
      server,
      'app.post("/api/evidence/reset"',
      '// Judge: read-only evaluation',
    );

    expect(route).toContain('const activeMission = fleetRunner.getActiveMission()');
    expect(route).toContain('activeMission.status === "running"');
    expect(route).toContain('activeMission.status === "paused_for_consent"');
    expect(route).toContain('res.status(409).json({ error: "mission_active_reset_blocked" })');

    const ownershipCheck = route.indexOf('const activeMission = fleetRunner.getActiveMission()');
    const conflict = route.indexOf('mission_active_reset_blocked');
    const resetEvidence = route.indexOf('fleetRunner.resetEvidence()');
    const clearConsent = route.indexOf('fleetRunner.getConsentEngine().clearRequests()');

    expect(ownershipCheck).toBeGreaterThanOrEqual(0);
    expect(conflict).toBeGreaterThan(ownershipCheck);
    expect(resetEvidence).toBeGreaterThan(conflict);
    expect(clearConsent).toBeGreaterThan(resetEvidence);
  });

  it('treats paused-for-consent as mission-active for destructive UI controls without faking execution state', () => {
    expect(app).toContain('const isRunning = activeMission?.status === "running";');
    expect(app).toContain('const missionActive =');
    expect(app).toContain('activeMission?.status === "running" || activeMission?.status === "paused_for_consent"');
    expect(app).toContain('<MissionControl\n          onRunMission={handleRunMission}\n          isRunning={missionActive}');
    expect(app).toContain('<LiveExecutionStream\n            steps={activeMission?.steps || []}\n            activeAgentId={activeMission?.activeAgentId}\n            isRunning={isRunning}');
  });

  it('keeps production HTTP coverage for both blocked active reset and allowed terminal reset', () => {
    expect(httpE2e).toContain("blockedReset.response.status !== 409");
    expect(httpE2e).toContain("blockedReset.body?.error !== 'mission_active_reset_blocked'");
    expect(httpE2e).toContain("activeAfterBlockedReset.body?.mission?.status !== 'paused_for_consent'");
    expect(httpE2e).toContain('chainAfterBlockedReset.body?.count !== chainBeforeBlockedReset.body.count');
    expect(httpE2e).toContain('terminalReset.body?.success !== true');
    expect(httpE2e).toContain('activeAfterTerminalReset.body?.mission !== null');
    expect(httpE2e).toContain('chainAfterTerminalReset.body?.count !== 0');
    expect(httpE2e).toContain('pendingAfterTerminalReset.body.requests.length !== 0');
  });
});
