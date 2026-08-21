import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-deploy-candidate.yml'), 'utf8');

describe('GCP candidate deployment target binding', () => {
  it('binds the approved non-secret target identity directly to the candidate workflow revision', () => {
    expect(workflow).toContain('GCP_PROJECT_ID: project-b29d4703-a302-4b05-b2e');
    expect(workflow).toContain('GCP_REGION: europe-west1');
    expect(workflow).toContain('GCP_WIF_PROVIDER: projects/511695074775/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo');
    expect(workflow).toContain('GCP_DEPLOY_SERVICE_ACCOUNT: prooffleet-deploy@project-b29d4703-a302-4b05-b2e.iam.gserviceaccount.com');
    expect(workflow).toContain('PROOFFLEET_CLOUDRUN_SERVICE: prooffleet');
    expect(workflow).toContain('PROOFFLEET_ARTIFACT_REPOSITORY: prooffleet');
  });

  it('does not depend on mutable repository variables for the candidate target', () => {
    expect(workflow).not.toContain('vars.PROOFFLEET_');
  });

  it('binds pull-request action explicitly instead of assuming a shell GITHUB_EVENT_ACTION variable', () => {
    expect(workflow).toContain('EVENT_ACTION: ${{ github.event.action }}');
    expect(workflow).toContain('test "${EVENT_ACTION:-}" != \'labeled\'');
    expect(workflow).toContain('got action=${EVENT_ACTION:-<missing>}');
    expect(workflow).not.toContain('GITHUB_EVENT_ACTION');
  });

  it('retains WIF-only authentication and zero-traffic deployment semantics', () => {
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('workload_identity_provider: ${{ env.GCP_WIF_PROVIDER }}');
    expect(workflow).toContain('service_account: ${{ env.GCP_DEPLOY_SERVICE_ACCOUNT }}');
    expect(workflow).not.toContain('credentials_json');
    expect(workflow).toContain('gcloud run deploy "$PROOFFLEET_CLOUDRUN_SERVICE"');
    expect(workflow).toContain('--no-traffic');
    expect(workflow).toContain('--tag="$CANDIDATE_TAG"');
    expect(workflow).not.toContain('LATEST=100');
  });
});
