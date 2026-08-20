import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

function run(command, args, label) {
  console.log(`\n[verify-ci] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}`);
  }
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...walk(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function truthGuard() {
  console.log('\n[verify-ci] production truth guards');
  const forbidden = [
    ['AUTO_CONSENT', /Operator \(Auto-Validated\)|Auto-Validated/],
    ['HARDCODED_TRUTH_SCORE', /overallTruthScore\s*:\s*98\.4|overallConsensusScore\s*:\s*98\.6|empiricalScore\s*:\s*98\.8/],
    ['FAKE_SENTINEL_RESULT', /promptInjectionRisk\s*:\s*["']NEGLIGIBLE["']|secretsExposure\s*:\s*["']NONE_DETECTED["']|policyViolations\s*:\s*0/],
    ['CLIENT_ASSERTED_OPERATOR_IDENTITY', /const\s*\{[^}]*operatorIdentity[^}]*\}\s*=\s*req\.body/],
  ];

  const findings = [];
  for (const base of ['server', 'src']) {
    for (const file of walk(join(root, base))) {
      const text = readFileSync(file, 'utf8');
      for (const [family, pattern] of forbidden) {
        if (pattern.test(text)) {
          findings.push(`${family}: ${relative(root, file)}`);
        }
      }
    }
  }
  if (findings.length > 0) {
    throw new Error(`forbidden truth-path patterns found:\n${findings.join('\n')}`);
  }
  console.log('[verify-ci] truth guards clear');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function runtimeSmoke() {
  const smokePort = 3187;
  const smokeBaseUrl = `http://127.0.0.1:${smokePort}`;
  console.log(`\n[verify-ci] production runtime HTTP smoke on injected PORT=${smokePort}`);
  const child = spawn(process.execPath, ['dist/server.cjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(smokePort),
      GEMINI_API_KEY: '',
      PROOFFLEET_OPERATOR_TOKEN: '',
      PROOFFLEET_SESSION_SECRET: '',
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
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(`${smokeBaseUrl}/api/health`);
        if (response.ok) {
          healthy = true;
          break;
        }
      } catch {
        // server still starting
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!healthy) throw new Error(`server did not become healthy on injected PORT=${smokePort}\n${logs}`);
    if (!logs.includes(`0.0.0.0:${smokePort}`)) {
      throw new Error(`server startup log does not confirm injected PORT=${smokePort}\n${logs}`);
    }

    const health = await fetchJson(`${smokeBaseUrl}/api/health`);
    if (!health.response.ok || health.body?.status !== 'ok') {
      throw new Error('health contract failed');
    }
    if (health.body?.agentCount !== 8) {
      throw new Error(`health expected 8 agents, got ${health.body?.agentCount}`);
    }

    const agents = await fetchJson(`${smokeBaseUrl}/api/agents`);
    if (!agents.response.ok || !Array.isArray(agents.body?.agents) || agents.body.agents.length !== 8) {
      throw new Error('runtime agent manifest contract failed');
    }

    const integrations = await fetchJson(`${smokeBaseUrl}/api/integrations/status`);
    if (!integrations.response.ok || !Array.isArray(integrations.body?.integrations)) {
      throw new Error('integration status endpoint contract failed');
    }
    const validProvisioningStates = new Set(['NOT_PROVISIONED', 'PROVISIONED_VERIFIED', 'PROVISIONING_FAILED']);
    for (const integration of integrations.body.integrations) {
      if (!validProvisioningStates.has(integration.status)) {
        throw new Error(`invalid provisioning status for ${integration.service}: ${integration.status}`);
      }
    }

    const telemetry = await fetchJson(`${smokeBaseUrl}/api/telemetry`);
    if (!telemetry.response.ok || telemetry.body?.activeAgentsCount !== 8) {
      throw new Error('telemetry agent count contract failed');
    }
    if (typeof telemetry.body?.chainIntegrityValid !== 'boolean') {
      throw new Error('telemetry chain integrity contract missing');
    }

    const operator = await fetchJson(`${smokeBaseUrl}/api/operator/session`);
    if (!operator.response.ok || operator.body?.configured !== false || operator.body?.authenticated !== false) {
      throw new Error('unprovisioned operator auth must report fail-closed state');
    }

    const consentNoIntent = await fetchJson(`${smokeBaseUrl}/api/consent/respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'missing', decision: 'APPROVED' }),
    });
    if (consentNoIntent.response.status !== 403) {
      throw new Error(`consent without intent header expected 403, got ${consentNoIntent.response.status}`);
    }

    const consentNoAuth = await fetchJson(`${smokeBaseUrl}/api/consent/respond`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-prooffleet-consent-intent': '1',
      },
      body: JSON.stringify({ requestId: 'missing', decision: 'APPROVED' }),
    });
    if (consentNoAuth.response.status !== 503) {
      throw new Error(`unprovisioned consent auth expected 503, got ${consentNoAuth.response.status}`);
    }

    console.log('[verify-ci] runtime HTTP smoke passed on injected PORT');
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

async function main() {
  run('npm', ['run', 'lint'], 'TypeScript contract check');
  run('npm', ['test', '--', '--reporter=verbose'], 'unit + adversarial regression tests');
  truthGuard();
  run('npm', ['run', 'build'], 'production build');
  await runtimeSmoke();
  run(process.execPath, ['scripts/verify-consent-http-e2e.mjs'], 'authenticated consent production HTTP E2E');
  console.log('\n[verify-ci] VERIFIED_LOCAL_CHAIN');
}

main().catch((error) => {
  console.error(`\n[verify-ci] FAILED: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
