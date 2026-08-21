import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-live-proof.yml'), 'utf8');
const liveProofScript = readFileSync(join(here, '../scripts/gcp-live-proof.ts'), 'utf8');

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
    expect(workflow).toContain('create_credentials_file: true');
    expect(workflow).toContain('export_environment_variables: true');
    expect(workflow).not.toContain('credentials_json');
    expect(workflow).not.toContain('GCP_CREDENTIALS');
  });

  it('uses a Node-24-ready setup action while keeping application execution on Node 22', () => {
    expect(workflow).toContain('uses: actions/setup-node@v7');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).not.toContain('actions/setup-node@v4');
  });

  it('binds source revision and explicit consent before any Firestore proof write', () => {
    expect(workflow).toContain('PROOFFLEET_SOURCE_REVISION: ${{ github.sha }}');
    expect(workflow).toContain('I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE');
    expect(workflow).toContain('PROOFFLEET_LIVE_CONFIRMATION: ${{ inputs.confirmation }}');
  });

  it('authoritatively reads the active Google principal and project number', () => {
    expect(workflow).toContain("gcloud auth list --filter=status:ACTIVE --format='value(account)'");
    expect(workflow).toContain('gcloud projects describe "$GCP_PROJECT_ID"');
    expect(workflow).toContain('PROOFFLEET_WIF_PRINCIPAL');
    expect(workflow).toContain('PROOFFLEET_GCP_PROJECT_NUMBER');
    expect(workflow).toContain('Authenticated Google project number does not match WIF provider project number.');
  });

  it('uses generated WIF credential configuration as hashed evidence without logging credential contents', () => {
    expect(liveProofScript).toContain('process.env.GOOGLE_APPLICATION_CREDENTIALS');
    expect(liveProofScript).toContain('parseGoogleWifCredentialEvidence');
    expect(liveProofScript).toContain('bindExecutionToCredential');
    expect(liveProofScript).toContain('authenticatedGcpIdentity');
    expect(liveProofScript).not.toMatch(/console\.log\([^\n]*GOOGLE_APPLICATION_CREDENTIALS/);
    expect(liveProofScript).not.toContain('credential_source.headers.Authorization');
  });

  it('keeps credential-parser failure fail-closed with a blocked v3 receipt', () => {
    expect(liveProofScript).toContain('WIF credential evidence rejected fail-closed');
    expect(liveProofScript).toContain("'BLOCKED_BY_MISSING_EVIDENCE'");
    expect(liveProofScript).toMatch(/schemaVersion:\s*'prooffleet\.gcp-live-proof\.v3'/);
    expect(liveProofScript).toContain('baseReceipt(plan)');
  });

  it('requires a v3 observed receipt with credential binding and receipt hash', () => {
    expect(workflow).toContain("r.schemaVersion !== 'prooffleet.gcp-live-proof.v3'");
    expect(workflow).toContain("r.outcome !== 'OBSERVED'");
    expect(workflow).toContain('executionCredentialBindingHash');
    expect(workflow).toContain('receiptHash');
    expect(workflow).not.toContain("r.schemaVersion!=='prooffleet.gcp-live-proof.v2'");
  });
});
