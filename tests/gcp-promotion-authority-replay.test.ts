import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-promote-candidate.yml'), 'utf8');

describe('GCP candidate promotion authority and replay boundary', () => {
  it('uses immutable repository, owner and actor IDs before WIF authentication', () => {
    expect(workflow).toContain("EXPECTED_GITHUB_REPOSITORY_ID: '1339097875'");
    expect(workflow).toContain("EXPECTED_GITHUB_REPOSITORY_OWNER_ID: '266194342'");
    expect(workflow).toContain("EXPECTED_GITHUB_ACTOR_ID: '266194342'");
    expect(workflow).toContain('GitHub repository ID does not match the approved promotion repository.');
    expect(workflow).toContain('GitHub repository owner ID does not match the approved promotion owner.');
    expect(workflow).toContain('GitHub actor ID is not authorized for candidate promotion.');
  });

  it('blocks GitHub re-runs before provider authentication can mutate traffic', () => {
    const guard = workflow.indexOf('test "$GITHUB_RUN_ATTEMPT" != \'1\'');
    const auth = workflow.indexOf('- name: Authenticate to Google Cloud using WIF');
    const trafficMutation = workflow.indexOf('gcloud run services update-traffic "$PROOFFLEET_CLOUDRUN_SERVICE"');
    expect(guard).toBeGreaterThan(-1);
    expect(workflow).toContain('GitHub re-runs are blocked before WIF authentication.');
    expect(auth).toBeGreaterThan(guard);
    expect(trafficMutation).toBeGreaterThan(auth);
  });

  it('binds the pull-request label action and immutable PR identities explicitly', () => {
    expect(workflow).toContain('EVENT_ACTION: ${{ github.event.action }}');
    expect(workflow).toContain('PR_AUTHOR_ID: ${{ github.event.pull_request.user.id }}');
    expect(workflow).toContain('PR_HEAD_REPOSITORY_ID: ${{ github.event.pull_request.head.repo.id }}');
    expect(workflow).toContain('test "$EVENT_ACTION" != \'labeled\'');
    expect(workflow).not.toContain('$GITHUB_EVENT_ACTION');
    expect(workflow).toContain('test "$PR_AUTHOR_ID" != "$EXPECTED_GITHUB_ACTOR_ID"');
    expect(workflow).toContain('test "$PR_HEAD_REPOSITORY" != "$GITHUB_REPOSITORY" || test "$PR_HEAD_REPOSITORY_ID" != "$EXPECTED_GITHUB_REPOSITORY_ID"');
  });

  it('binds the approved non-secret promotion target in source instead of unset mutable repo variables', () => {
    expect(workflow).toContain('GCP_PROJECT_ID: project-b29d4703-a302-4b05-b2e');
    expect(workflow).toContain('GCP_REGION: europe-west1');
    expect(workflow).toContain('GCP_WIF_PROVIDER: projects/511695074775/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo');
    expect(workflow).toContain('GCP_DEPLOY_SERVICE_ACCOUNT: prooffleet-deploy@project-b29d4703-a302-4b05-b2e.iam.gserviceaccount.com');
    expect(workflow).not.toContain('vars.PROOFFLEET_');
  });
});
