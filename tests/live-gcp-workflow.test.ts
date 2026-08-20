import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-live-proof.yml'), 'utf8');

describe('Live GCP proof workflow safety', () => {
  it('is manual-only and never runs on push or pull_request', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
  });

  it('uses OIDC/WIF instead of long-lived service-account key JSON', () => {
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('workload_identity_provider:');
    expect(workflow).toContain('service_account:');
    expect(workflow).not.toContain('credentials_json');
    expect(workflow).not.toContain('GCP_CREDENTIALS');
  });

  it('binds the proof source revision to github.sha and requires explicit write confirmation', () => {
    expect(workflow).toContain('PROOFFLEET_SOURCE_REVISION: ${{ github.sha }}');
    expect(workflow).toContain('I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE');
    expect(workflow).toContain('PROOFFLEET_LIVE_CONFIRMATION: ${{ inputs.confirmation }}');
  });
});
