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

describe('mission start authority and cost boundary', () => {
  it('requires explicit intent and authenticated operator authority before startMission', () => {
    const route = between(
      server,
      'app.post("/api/fleet/run"',
      '// Server-Sent Events (SSE)',
    );

    const intentIndex = route.indexOf('x-prooffleet-mission-intent');
    const authenticateIndex = route.indexOf('operatorSessions.authenticate(req.headers.cookie)');
    const startIndex = route.indexOf('fleetRunner.startMission(');

    expect(intentIndex).toBeGreaterThanOrEqual(0);
    expect(authenticateIndex).toBeGreaterThan(intentIndex);
    expect(startIndex).toBeGreaterThan(authenticateIndex);
    expect(route).toContain('res.status(403)');
    expect(route).toContain('res.status(503)');
    expect(route).toContain('res.status(401)');
  });

  it('sends mission intent with the HttpOnly same-origin operator session from the browser', () => {
    const handler = between(
      app,
      'const handleRunMission = async',
      'const handleVerifyChain = async',
    );

    expect(handler).toContain('"X-ProofFleet-Mission-Intent": "1"');
    expect(handler).toContain('credentials: "same-origin"');
    expect(handler).toContain('if (!res.ok || data.success !== true || !data.mission)');
    expect(handler).toContain('res.status === 401');
    expect(handler).toContain('res.status === 503');
    expect(handler).not.toContain('operatorIdentity');
    expect(handler).not.toContain('GOOGLE_API_KEY');
    expect(handler).not.toContain('GEMINI_API_KEY');
  });

  it('does not clear prior verification UI until a mission start is actually accepted', () => {
    const handler = between(
      app,
      'const handleRunMission = async',
      'const handleVerifyChain = async',
    );

    const failureGuard = handler.indexOf('if (!res.ok || data.success !== true || !data.mission)');
    const clearVerification = handler.indexOf('setVerificationResult(null)');
    const setMission = handler.indexOf('setActiveMission(data.mission)');

    expect(failureGuard).toBeGreaterThanOrEqual(0);
    expect(clearVerification).toBeGreaterThan(failureGuard);
    expect(setMission).toBeGreaterThan(clearVerification);
  });

  it('exercises 403 and 401 mission-start failures in the production HTTP E2E before any mission exists', () => {
    expect(httpE2e).toContain("mission start without explicit intent expected 403");
    expect(httpE2e).toContain("mission start without operator session expected 401");
    expect(httpE2e).toContain("unauthorized mission attempts mutated active mission state");
    expect(httpE2e).toContain("'x-prooffleet-mission-intent': '1'");
  });
});
