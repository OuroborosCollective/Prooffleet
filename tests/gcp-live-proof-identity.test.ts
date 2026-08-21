import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildExecutionIdentity } from '../scripts/gcp-live-proof';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-live-proof.yml'), 'utf8');

const env = {
  PROOFFLEET_GITHUB_RUN_ID: '32516371741',
  PROOFFLEET_GITHUB_RUN_ATTEMPT: '1',
  PROOFFLEET_GITHUB_REPOSITORY_ID: '1339097875',
  PROOFFLEET_GITHUB_REPOSITORY_OWNER_ID: '266194342',
  PROOFFLEET_GITHUB_ACTOR_ID: '266194342',
  PROOFFLEET_WIF_PRINCIPAL: 'prooffleet-github@example-project.iam.gserviceaccount.com',
  PROOFFLEET_GCP_PROJECT_NUMBER: '511695074775',
};

describe('live GCP credential evidence identity', () => {
  it('accepts immutable numeric GitHub IDs plus observed Google principal/project number', () => {
    expect(buildExecutionIdentity(env)).toEqual({
      githubRunId: '32516371741', githubRunAttempt: '1', repositoryId: '1339097875',
      repositoryOwnerId: '266194342', actorId: '266194342',
      wifPrincipal: 'prooffleet-github@example-project.iam.gserviceaccount.com', gcpProjectNumber: '511695074775',
    });
  });

  it('rejects display names in immutable identity fields', () => {
    expect(() => buildExecutionIdentity({ ...env, PROOFFLEET_GITHUB_ACTOR_ID: 'OuroborosCollective' })).toThrow(/positive decimal integer/);
    expect(() => buildExecutionIdentity({ ...env, PROOFFLEET_GITHUB_REPOSITORY_ID: 'OuroborosCollective\/Prooffleet' })).toThrow(/positive decimal integer/);
  });

  it('rejects an unobserved or malformed credential principal', () => {
    expect(() => buildExecutionIdentity({ ...env, PROOFFLEET_WIF_PRINCIPAL: 'owner-name' })).toThrow(/service-account principal/);
  });

  it('requires authenticated gcloud readback of active principal and project', () => {
    expect(workflow).toContain("gcloud auth list --filter=status:ACTIVE --format='value(account)'");
    expect(workflow).toContain('ACTIVE_ACCOUNT\" != \"$GCP_WIF_SERVICE_ACCOUNT');
    expect(workflow).toContain('gcloud projects describe "$GCP_PROJECT_ID"');
    expect(workflow).toContain('PROOFFLEET_WIF_PRINCIPAL');
    expect(workflow).toContain('PROOFFLEET_GCP_PROJECT_NUMBER');
  });

  it('binds the live-proof artifact name to run, attempt and source SHA', () => {
    expect(workflow).toContain('prooffleet-gcp-live-proof-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}');
    expect(workflow).toContain("r.schemaVersion!=='prooffleet.gcp-live-proof.v2'");
  });
});
