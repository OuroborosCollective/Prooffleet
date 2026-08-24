import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-adk-canary.yml'), 'utf8');
const ownCandidateOutput = '$' + '{{ steps.candidate.outputs.candidate_url }}';

function step(from, until) {
  const start = workflow.indexOf(from);
  const end = workflow.indexOf(until, start);
  if (start < 0 || end < 0) throw new Error(`workflow step not found: ${from}`);
  return workflow.slice(start, end);
}

describe('GCP ADK canary workflow safety contract', () => {
  it('reads the health URL directly from the provider service readback instead of its own unavailable step output', () => {
    const candidate = step(
      'Resolve exact zero-traffic tagged candidate from provider state',
      'Mint audience-bound Google ID token and trigger exactly one canary',
    );
    expect(candidate).toContain('CANDIDATE_URL="$(node -e');
    expect(candidate).toContain("const t=(s.status?.traffic||[]).find(x=>x.tag==='$CANDIDATE_TAG');");
    expect(candidate).toContain('Provider candidate URL readback is malformed.');
    expect(candidate).toContain('"$CANDIDATE_URL/api/health"');
    expect(candidate).not.toContain(ownCandidateOutput);
  });

  it('requires actual WIF principal, project number and secret-free credential configuration before provider readback', () => {
    const authenticate = workflow.indexOf('Authenticate to Google Cloud using existing deploy WIF');
    const wif = workflow.indexOf('Prove ADK WIF principal, project and credential configuration');
    const candidate = workflow.indexOf('Resolve exact zero-traffic tagged candidate from provider state');
    expect(authenticate).toBeGreaterThan(-1);
    expect(wif).toBeGreaterThan(authenticate);
    expect(candidate).toBeGreaterThan(wif);
    expect(workflow).toContain('gcloud projects describe "$GCP_PROJECT_ID"');
    expect(workflow).toContain('node scripts/verify-wif-identity.mjs');
    expect(workflow).toContain('WIF_CREDENTIAL_CONFIG_SHA256: ${{ steps.wif.outputs.credential_config_sha256 }}');
    expect(workflow).toContain('wifCredential,');
  });

  it('fails closed on a mutated or wrong-source receipt before artifact upload', () => {
    const observed = workflow.indexOf('Require source-bound observed ADK Gemini receipt');
    const integrity = workflow.indexOf('Verify ADK canary receipt integrity before upload');
    const upload = workflow.indexOf('Upload ADK canary proof receipt');
    expect(observed).toBeGreaterThan(-1);
    expect(integrity).toBeGreaterThan(observed);
    expect(upload).toBeGreaterThan(integrity);
    expect(workflow).toContain('node scripts/verify-adk-canary-receipt.mjs');
    expect(workflow).toContain('gcp-adk-canary-receipt.json');
    expect(workflow).toContain('"$EXPECTED_SOURCE_REVISION"');
  });
});
