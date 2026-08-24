import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-live-proof.yml'), 'utf8');
const liveProofScript = readFileSync(join(here, '../scripts/gcp-live-proof.ts'), 'utf8');

describe('Live GCP proof workflow safety', () => {
  it('accepts only explicit manual consent or the dedicated owner one-shot label and never runs on push', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toMatch(/^\s*pull_request:/m);
    expect(workflow).toContain('types:\n      - labeled');
    expect(workflow).toContain("github.event.label.name == 'proofleet-live-gcp-once'");
    expect(workflow).toContain("github.actor == 'OuroborosCollective'");
    expect(workflow).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(workflow).not.toMatch(/^\s*push:/m);
  });

  it('binds the approved non-secret live-proof target in source instead of depending on unset mutable repository variables', () => {
    expect(workflow).toContain('GCP_PROJECT_ID: project-b29d4703-a302-4b05-b2e');
    expect(workflow).toContain('GCP_REGION: europe-west1');
    expect(workflow).toContain('GCP_WIF_PROVIDER: projects/511695074775/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo');
    expect(workflow).toContain('GCP_WIF_SERVICE_ACCOUNT: prooffleet-github@project-b29d4703-a302-4b05-b2e.iam.gserviceaccount.com');
    expect(workflow).toContain('PROOFFLEET_CLOUDRUN_SERVICE: prooffleet');
    expect(workflow).toContain('PROOFFLEET_FIRESTORE_COLLECTION: prooffleet-live-proofs');
    for (const variable of [
      'PROOFFLEET_GCP_PROJECT_ID',
      'PROOFFLEET_GCP_REGION',
      'PROOFFLEET_GCP_WIF_PROVIDER',
      'PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT',
      'PROOFFLEET_CLOUDRUN_SERVICE',
      'PROOFFLEET_FIRESTORE_COLLECTION',
    ]) {
      expect(workflow).not.toContain(`vars.${variable}`);
    }
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

  it('checks out and binds the exact source revision plus explicit consent before any Firestore proof write', () => {
    expect(workflow).toContain("PROOFFLEET_SOURCE_REVISION: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}");
    expect(workflow).toContain('ref: ${{ env.PROOFFLEET_SOURCE_REVISION }}');
    expect(workflow).toContain('I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE');
    expect(workflow).toContain("PROOFFLEET_LIVE_CONFIRMATION: ${{ github.event_name == 'workflow_dispatch' && inputs.confirmation || 'I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE' }}");
    expect(workflow).toContain('ACTUAL_SOURCE_REVISION="$(git rev-parse HEAD)"');
  });

  it('pins label consent to exact immutable PR authority and rejects foreign repositories', () => {
    expect(workflow).toContain("PR_LABEL_NAME: ${{ github.event.label.name }}");
    expect(workflow).toContain("PR_AUTHOR_ID: ${{ github.event.pull_request.user.id }}");
    expect(workflow).toContain("PR_HEAD_REPOSITORY_ID: ${{ github.event.pull_request.head.repo.id }}");
    expect(workflow).toContain('test "$EVENT_ACTION" != \'labeled\'');
    expect(workflow).toContain('test "$PR_LABEL_NAME" != \'proofleet-live-gcp-once\'');
    expect(workflow).toContain('test "$PR_AUTHOR_ID" != "$EXPECTED_GITHUB_ACTOR_ID"');
    expect(workflow).toContain('test "$PR_HEAD_REPOSITORY" != "$GITHUB_REPOSITORY"');
    expect(workflow).toContain('test "$PR_HEAD_REPOSITORY_ID" != "$EXPECTED_GITHUB_REPOSITORY_ID"');
  });

  it('pins mutation authority to immutable repository, owner and actor IDs and blocks GitHub re-runs before WIF authentication', () => {
    expect(workflow).toContain("EXPECTED_GITHUB_REPOSITORY_ID: '1339097875'");
    expect(workflow).toContain("EXPECTED_GITHUB_REPOSITORY_OWNER_ID: '266194342'");
    expect(workflow).toContain("EXPECTED_GITHUB_ACTOR_ID: '266194342'");
    expect(workflow).toContain('test "$PROOFFLEET_GITHUB_REPOSITORY_ID" != "$EXPECTED_GITHUB_REPOSITORY_ID"');
    expect(workflow).toContain('test "$PROOFFLEET_GITHUB_REPOSITORY_OWNER_ID" != "$EXPECTED_GITHUB_REPOSITORY_OWNER_ID"');
    expect(workflow).toContain('test "$PROOFFLEET_GITHUB_ACTOR_ID" != "$EXPECTED_GITHUB_ACTOR_ID"');
    expect(workflow).toContain('GitHub actor ID is not authorized for the live-proof mutation.');
    expect(workflow).toContain('test "$PROOFFLEET_GITHUB_RUN_ATTEMPT" != \'1\'');
    expect(workflow).toContain('GitHub re-runs are blocked before provider authentication.');

    const rerunGuard = workflow.indexOf('test "$PROOFFLEET_GITHUB_RUN_ATTEMPT" != \'1\'');
    const providerAuth = workflow.indexOf('- name: Authenticate to Google Cloud with Workload Identity Federation');
    expect(rerunGuard).toBeGreaterThan(-1);
    expect(providerAuth).toBeGreaterThan(rerunGuard);
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

  it('requires a v3 observed receipt with credential binding, exact source and receipt hash', () => {
    expect(workflow).toContain("r.schemaVersion !== 'prooffleet.gcp-live-proof.v3'");
    expect(workflow).toContain("r.outcome !== 'OBSERVED'");
    expect(workflow).toContain('executionCredentialBindingHash');
    expect(workflow).toContain('receiptHash');
    expect(workflow).toContain('r.sourceRevision !== process.env.PROOFFLEET_SOURCE_REVISION');
    expect(workflow).not.toContain("r.schemaVersion!=='prooffleet.gcp-live-proof.v2'");
  });
});
