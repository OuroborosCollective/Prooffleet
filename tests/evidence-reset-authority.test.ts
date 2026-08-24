import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, '../server.ts'), 'utf8');
const app = readFileSync(join(here, '../src/App.tsx'), 'utf8');
const missionControl = readFileSync(join(here, '../src/components/MissionControl.tsx'), 'utf8');

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`unable to isolate source block: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

describe('evidence reset authority contract', () => {
  it('requires explicit destructive intent and authenticated operator authority before resetEvidence', () => {
    const route = between(
      server,
      'app.post("/api/evidence/reset"',
      '// Judge: read-only evaluation',
    );

    expect(route).toContain('x-prooffleet-evidence-reset-intent');
    expect(route).toContain('res.status(403)');
    expect(route).toContain('operatorSessions.authenticate(req.headers.cookie)');
    expect(route).toContain('res.status(503)');
    expect(route).toContain('res.status(401)');
    expect(route).toContain('fleetRunner.resetEvidence()');

    expect(route.indexOf('x-prooffleet-evidence-reset-intent')).toBeLessThan(
      route.indexOf('fleetRunner.resetEvidence()'),
    );
    expect(route.indexOf('operatorSessions.authenticate(req.headers.cookie)')).toBeLessThan(
      route.indexOf('fleetRunner.resetEvidence()'),
    );
  });

  it('binds the browser reset action to the HttpOnly operator session and explicit intent', () => {
    const handler = between(
      app,
      'const handleResetChain = async () => {',
      'const handleOperatorAuthenticate = async',
    );

    expect(handler).toContain('"X-ProofFleet-Evidence-Reset-Intent": "1"');
    expect(handler).toContain('credentials: "same-origin"');
    expect(handler).toContain('if (!res.ok || data.success !== true)');
    expect(handler).toContain('setOperatorSession');
  });

  it('never clears local truth state before the server confirms the reset', () => {
    const handler = between(
      app,
      'const handleResetChain = async () => {',
      'const handleOperatorAuthenticate = async',
    );

    const successCheck = handler.indexOf('if (!res.ok || data.success !== true)');
    const clearVerification = handler.indexOf('setVerificationResult(null)');
    const clearMission = handler.indexOf('setActiveMission(null)');

    expect(successCheck).toBeGreaterThanOrEqual(0);
    expect(clearVerification).toBeGreaterThan(successCheck);
    expect(clearMission).toBeGreaterThan(successCheck);
  });

  it('does not present the destructive reset control as available without authenticated operator state', () => {
    expect(app).toContain('canResetChain={operatorSession.configured && operatorSession.authenticated}');
    expect(missionControl).toContain('canResetChain: boolean');
    expect(missionControl).toContain('disabled={isRunning || !canResetChain}');
    expect(missionControl).toContain('Authenticated operator session required to reset evidence');
  });
});
