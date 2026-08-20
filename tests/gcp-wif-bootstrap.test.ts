import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '../scripts/bootstrap-gcp-wif.sh'), 'utf8');

describe('GCP WIF bootstrap safety contract', () => {
  it('defaults to dry-run and requires explicit --apply for mutations', () => {
    expect(source).toContain('APPLY=false');
    expect(source).toContain('--apply)');
    expect(source).toContain('apply_or_plan');
    expect(source).toContain("log \"dry-run complete");
  });

  it('never creates or accepts long-lived service-account JSON keys', () => {
    expect(source).not.toMatch(/service-accounts\s+keys\s+create/i);
    expect(source).not.toMatch(/credentials_json/i);
    expect(source).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS=.*\.json/i);
  });

  it('restricts GitHub OIDC admission to the exact ProofFleet repository', () => {
    expect(source).toContain('GITHUB_REPO="OuroborosCollective/Prooffleet"');
    expect(source).toContain("EXPECTED_CONDITION=\"assertion.repository == '${GITHUB_REPO}'\"");
    expect(source).toContain('attribute.repository=assertion.repository');
  });

  it('grants only the current live-proof provider roles', () => {
    expect(source).toContain('roles/iam.workloadIdentityUser');
    expect(source).toContain('roles/run.viewer');
    expect(source).toContain('roles/datastore.user');
    expect(source).not.toContain('roles/owner');
    expect(source).not.toContain('roles/editor');
    expect(source).not.toContain('roles/run.admin');
  });

  it('does not silently choose or create a Firestore database location', () => {
    expect(source).toContain("gcloud firestore databases describe --database='(default)'");
    expect(source).not.toMatch(/gcloud\s+firestore\s+databases\s+create/i);
    expect(source).toContain('Create it explicitly in the intended location before live proof.');
  });

  it('requires real project, region and Cloud Run service identities', () => {
    expect(source).toContain('--project-id, --region and --cloud-run-service are required.');
    expect(source).not.toContain('REGION="europe-west1"');
  });

  it('emits all six repository variables required by the live-proof workflow', () => {
    for (const variable of [
      'PROOFFLEET_GCP_PROJECT_ID',
      'PROOFFLEET_GCP_REGION',
      'PROOFFLEET_GCP_WIF_PROVIDER',
      'PROOFFLEET_GCP_WIF_SERVICE_ACCOUNT',
      'PROOFFLEET_CLOUDRUN_SERVICE',
      'PROOFFLEET_FIRESTORE_COLLECTION',
    ]) {
      expect(source).toContain(variable);
    }
  });
});
