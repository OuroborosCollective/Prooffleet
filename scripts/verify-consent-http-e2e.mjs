import { spawn } from 'node:child_process';

const baseUrl = 'http://127.0.0.1:3000';
const operatorToken = 'proof-fleet-ci-operator-token';
const operatorIdentity = 'ci-owner';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Some negative-path responses may intentionally have no JSON body.
  }
  return { response, body };
}

async function waitForHealth(logs) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await fetchJson('/api/health');
      if (result.response.ok && result.body?.status === 'ok') return;
    } catch {
      // Server still starting.
    }
    await sleep(250);
  }
  throw new Error(`production server did not become healthy\n${logs()}`);
}

async function waitForPendingConsent(excludedIds = new Set()) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await fetchJson('/api/consent/pending');
    if (!result.response.ok || !Array.isArray(result.body?.requests)) {
      throw new Error('pending consent endpoint contract failed');
    }
    const request = result.body.requests.find(
      (candidate) => candidate?.requestId && !excludedIds.has(candidate.requestId),
    );
    if (request) return request;
    await sleep(100);
  }
  throw new Error('mission did not reach pending consent state');
}

function extractCookiePair(setCookie) {
  if (typeof setCookie !== 'string' || setCookie.length === 0) {
    throw new Error('operator login did not issue Set-Cookie');
  }
  if (!setCookie.includes('HttpOnly')) throw new Error('operator cookie must be HttpOnly');
  if (!setCookie.includes('SameSite=Strict')) throw new Error('operator cookie must be SameSite=Strict');
  if (!setCookie.includes('Secure')) throw new Error('production operator cookie must be Secure');
  return setCookie.split(';', 1)[0];
}

async function startMission(title, inputGoal, cookie) {
  const result = await fetchJson('/api/fleet/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-prooffleet-mission-intent': '1',
      cookie,
    },
    body: JSON.stringify({
      title,
      inputGoal,
      presetKey: 'custom',
      strictness: 'high_assurance',
      thinkingLevel: 'HIGH',
      requireConsentForWrite: true,
    }),
  });
  if (!result.response.ok || result.body?.success !== true || !result.body?.mission?.id) {
    throw new Error(`mission start failed: ${JSON.stringify(result.body)}`);
  }
  return result.body.mission;
}

async function respondToConsent({ requestId, decision, cookie }) {
  return fetchJson('/api/consent/respond', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-prooffleet-consent-intent': '1',
      cookie,
    },
    body: JSON.stringify({
      requestId,
      decision,
      operatorIdentity: 'forged-client-identity-must-be-ignored',
      reason: `CI explicit ${decision.toLowerCase()} decision`,
    }),
  });
}

async function main() {
  console.log('[consent-http-e2e] starting configured production server');

  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      GEMINI_API_KEY: '',
      PROOFFLEET_OPERATOR_TOKEN: operatorToken,
      PROOFFLEET_SESSION_SECRET: 'proof-fleet-ci-session-secret-not-production',
      PROOFFLEET_OPERATOR_IDENTITY: operatorIdentity,
      GCP_PROJECT_ID: '',
      PROOFFLEET_FIRESTORE_COLLECTION: '',
      PROOFFLEET_SOURCE_REVISION: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  try {
    await waitForHealth(() => logs);

    const anonymousSession = await fetchJson('/api/operator/session');
    if (
      !anonymousSession.response.ok ||
      anonymousSession.body?.configured !== true ||
      anonymousSession.body?.authenticated !== false ||
      anonymousSession.body?.identity !== null
    ) {
      throw new Error('configured operator must begin unauthenticated');
    }

    const missingMissionIntent = await fetchJson('/api/fleet/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'must not run', inputGoal: 'must not run' }),
    });
    if (missingMissionIntent.response.status !== 403) {
      throw new Error(`mission start without explicit intent expected 403, got ${missingMissionIntent.response.status}`);
    }

    const unauthenticatedMission = await fetchJson('/api/fleet/run', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-prooffleet-mission-intent': '1',
      },
      body: JSON.stringify({ title: 'must not run', inputGoal: 'must not run' }),
    });
    if (unauthenticatedMission.response.status !== 401) {
      throw new Error(`mission start without operator session expected 401, got ${unauthenticatedMission.response.status}`);
    }

    const beforeLoginMission = await fetchJson('/api/fleet/active-mission');
    if (beforeLoginMission.body?.mission !== null) {
      throw new Error('unauthorized mission attempts mutated active mission state');
    }

    const badLogin = await fetchJson('/api/operator/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token' }),
    });
    if (badLogin.response.status !== 401) {
      throw new Error(`wrong operator credential expected 401, got ${badLogin.response.status}`);
    }

    const login = await fetchJson('/api/operator/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: operatorToken }),
    });
    if (!login.response.ok || login.body?.identity !== operatorIdentity) {
      throw new Error(`operator login failed: ${JSON.stringify(login.body)}`);
    }
    const cookie = extractCookiePair(login.response.headers.get('set-cookie'));

    const authenticatedSession = await fetchJson('/api/operator/session', {
      headers: { cookie },
    });
    if (
      !authenticatedSession.response.ok ||
      authenticatedSession.body?.authenticated !== true ||
      authenticatedSession.body?.identity !== operatorIdentity
    ) {
      throw new Error('issued operator session did not authenticate server-side identity');
    }

    const rejectMission = await startMission(
      'CI consent rejection path',
      'Create a bounded proof effect that requires explicit operator consent.',
      cookie,
    );

    const competingMission = await fetchJson('/api/fleet/run', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-prooffleet-mission-intent': '1',
        cookie,
      },
      body: JSON.stringify({
        title: 'CI competing mission must be rejected',
        inputGoal: 'This mission must never start while another mission owns the runtime.',
        presetKey: 'custom',
        strictness: 'high_assurance',
        thinkingLevel: 'HIGH',
        requireConsentForWrite: true,
      }),
    });
    if (
      competingMission.response.status !== 409 ||
      competingMission.body?.error !== 'mission_already_active'
    ) {
      throw new Error(
        `concurrent mission start expected 409 mission_already_active, got ${competingMission.response.status}: ${JSON.stringify(competingMission.body)}`,
      );
    }

    const activeAfterConflict = await fetchJson('/api/fleet/active-mission');
    if (activeAfterConflict.body?.mission?.id !== rejectMission.id) {
      throw new Error('concurrent mission attempt replaced the active mission');
    }

    const rejectRequest = await waitForPendingConsent();
    if (rejectRequest.missionId !== rejectMission.id) {
      throw new Error('pending consent request is not bound to the started mission');
    }

    const unauthenticatedDecision = await fetchJson('/api/consent/respond', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-prooffleet-consent-intent': '1',
      },
      body: JSON.stringify({ requestId: rejectRequest.requestId, decision: 'REJECTED' }),
    });
    if (unauthenticatedDecision.response.status !== 401) {
      throw new Error(`configured consent without session expected 401, got ${unauthenticatedDecision.response.status}`);
    }

    const rejected = await respondToConsent({
      requestId: rejectRequest.requestId,
      decision: 'REJECTED',
      cookie,
    });
    if (!rejected.response.ok || rejected.body?.grant?.decision !== 'REJECTED') {
      throw new Error(`explicit rejection failed: ${JSON.stringify(rejected.body)}`);
    }
    if (rejected.body?.grant?.operatorIdentity !== operatorIdentity) {
      throw new Error('client-supplied operatorIdentity overrode server-side identity on reject');
    }
    if (rejected.body?.mission?.status !== 'failed') {
      throw new Error(`rejected mission expected failed, got ${rejected.body?.mission?.status}`);
    }
    if (rejected.body?.mission?.finalVerdict?.judgeVerdict?.verdict !== 'BLOCKED_BY_MISSING_EVIDENCE') {
      throw new Error('rejected mission must remain BLOCKED_BY_MISSING_EVIDENCE');
    }

    const approveMission = await startMission(
      'CI consent approval without cloud executor',
      'Attempt the same bounded proof effect with explicit approval but no provisioned Firestore target.',
      cookie,
    );
    const approveRequest = await waitForPendingConsent(new Set([rejectRequest.requestId]));
    if (approveRequest.missionId !== approveMission.id) {
      throw new Error('second pending consent request is not bound to the second mission');
    }

    const approved = await respondToConsent({
      requestId: approveRequest.requestId,
      decision: 'APPROVED',
      cookie,
    });
    if (!approved.response.ok || approved.body?.grant?.decision !== 'APPROVED') {
      throw new Error(`explicit approval failed: ${JSON.stringify(approved.body)}`);
    }
    if (approved.body?.grant?.operatorIdentity !== operatorIdentity) {
      throw new Error('client-supplied operatorIdentity overrode server-side identity on approve');
    }
    if (approved.body?.mission?.status !== 'failed') {
      throw new Error(`unprovisioned approved mission expected failed, got ${approved.body?.mission?.status}`);
    }
    const approvedVerdict = approved.body?.mission?.finalVerdict?.judgeVerdict?.verdict;
    if (approvedVerdict !== 'BLOCKED_BY_MISSING_EVIDENCE') {
      throw new Error(`approval without Firestore readback must stay BLOCKED_BY_MISSING_EVIDENCE, got ${approvedVerdict}`);
    }

    const active = await fetchJson('/api/fleet/active-mission');
    if (active.body?.mission?.id !== approveMission.id || active.body?.mission?.status !== 'failed') {
      throw new Error('active mission readback does not match approved-but-unprovisioned outcome');
    }

    console.log('[consent-http-e2e] authenticated mission, concurrency and consent production E2E passed');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1500);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

main().catch((error) => {
  console.error(`[consent-http-e2e] FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
