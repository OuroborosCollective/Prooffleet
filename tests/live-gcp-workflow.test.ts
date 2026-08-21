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

  it('authorizes by immutable GitHub numeric identities rather than actor or repository names', () => {
    expect(workflow).toContain("EXPECTED_GITHUB_REPOSITORY_ID: '1339097875'");
    expect(workflow).toContain("EXPECTED_GITHUB_OWNER_ID: '266194342'");
    expect(workflow).toContain("EXPECTED_GITHUB_ACTOR_ID: '266194342'");
    expect(workflow).toContain('GITHUB_REPOSITORY_ID');
    expect(workflow).toContain('GITHUB_REPOSITORY_OWNER_ID');
    expect(workflow).toContain('GITHUB_ACTOR_ID');
    expect(workflow).not.toContain("GITHUB_ACTOR == 'OuroborosCollective'");
    expect(workflow).not.toContain("github.actor == 'OuroborosCollective'");
  });

  it('captures run and runner execution identity before provider authentication', () => {
    expect(workflow).toContain('Capture immutable GitHub execution identity');
    expect(workflow).toContain('buildGitHubExecutionIdentity');
    expect(workflow).toContain('GITHUB_RUN_ID');
    expect(workflow).toContain('GITHUB_RUN_ATTEMPT');
    expect(workflow).toContain('RUNNER_NAME');
    expect(workflow).toContain('RUNNER_OS');
    expect(workflow).toContain('RUNNER_ARCH');
    expect(workflow.indexOf('Capture immutable GitHub execution identity'))
      .toBeLessThan(workflow.indexOf('Authenticate to Google Cloud with Workload Identity Federation'));
  });

  it('persists receipt artifact id/digest binding instead of treating a green job as evidence', () => {
    expect(workflow).toContain('id: live_proof_artifact');
    expect(workflow).toContain('steps.live_proof_artifact.outputs.artifact-id');
    expect(workflow).toContain('steps.live_proof_artifact.outputs.artifact-digest');
    expect(workflow).toContain('buildArtifactBinding');
    expect(workflow).toContain('gcp-live-proof-artifact-binding.json');
    expect(workflow).toContain('prooffleet-gcp-live-proof-binding-');
  });
});
