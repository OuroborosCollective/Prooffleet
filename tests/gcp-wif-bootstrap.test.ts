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
    expect(source).toContain('dry-run complete; rerun with --apply');
  });

  it('never creates or accepts long-lived service-account JSON keys', () => {
    expect(source).not.toMatch(/service-accounts\s+keys\s+create/i);
    expect(source).not.toMatch(/credentials_json/i);
    expect(source).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS=.*\.json/i);
  });

  it('uses a dedicated GitHub WIF service account instead of the project default compute identity', () => {
    expect(source).toContain('SERVICE_ACCOUNT_ID="prooffleet-github"');
    expect(source).toContain('SA_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"');
    expect(source).not.toContain('compute@developer.gserviceaccount.com');
  });

  it('restricts WIF using immutable repository, owner and actor ids instead of repository names', () => {
    expect(source).toContain('GITHUB_REPOSITORY_ID="1339097875"');
    expect(source).toContain('GITHUB_OWNER_ID="266194342"');
    expect(source).toContain("assertion.repository_id == '${GITHUB_REPOSITORY_ID}'");
    expect(source).toContain("assertion.repository_owner_id == '${GITHUB_OWNER_ID}'");
    expect(source).toContain("assertion.actor_id == '${GITHUB_OWNER_ID}'");
    expect(source).toContain('attribute.repository_id=assertion.repository_id');
    expect(source).toContain('attribute.repository_owner_id=assertion.repository_owner_id');
    expect(source).toContain('attribute.actor_id=assertion.actor_id');
    expect(source).toContain('attribute.repository_id/${GITHUB_REPOSITORY_ID}');
    expect(source).not.toContain('attribute.repository/${GITHUB_REPO}');
  });

  it('fails closed if an existing provider still exposes the old mutable-name mapping', () => {
    expect(source).toContain('immutable-ID issuer/repository/actor restriction');
    expect(source).toContain("provider.get('attributeMapping')");
    expect(source).toContain("'attribute.repository_id': 'assertion.repository_id'");
    expect(source).toContain("'attribute.repository_owner_id': 'assertion.repository_owner_id'");
    expect(source).toContain("'attribute.actor_id': 'assertion.actor_id'");
    expect(source).toContain('Existing WIF provider attribute mapping is missing immutable GitHub identity claims.');
  });

  it('grants only the current live-proof provider roles', () => {
    expect(source).toContain('roles/iam.workloadIdentityUser');
    expect(source).toContain('roles/run.viewer');
    expect(source).toContain('roles/datastore.user');
    expect(source).not.toContain('roles/owner');
    expect(source).not.toContain('roles/editor');
    expect(source).not.toContain('roles/run.admin');
  });

  it('accepts either project ID or numeric project number and resolves canonical identity through gcloud', () => {
    expect(source).toContain('--project-id)');
    expect(source).toContain('--project-number)');
    expect(source).toContain('PROJECT_NUMBER_INPUT');
    expect(source).toContain('PROJECT_LOOKUP="${PROJECT_ID:-$PROJECT_NUMBER_INPUT}"');
    expect(source).toContain("--format='value(projectId)'");
    expect(source).toContain("--format='value(projectNumber)'");
    expect(source).toContain('Supplied project number does not match Google Cloud readback');
  });

  it('does not silently choose or create a Firestore database location and logs provider location readback', () => {
    expect(source).toContain("gcloud firestore databases describe --database='(default)'");
    expect(source).not.toMatch(/gcloud\s+firestore\s+databases\s+create/i);
    expect(source).toContain("--format='value(locationId)'");
    expect(source).toContain('Firestore default database exists: location=$FIRESTORE_LOCATION');
    expect(source).toContain('Create it explicitly in the intended location before live proof.');
  });

  it('requires real project identity, region and Cloud Run service without hardcoding owner console values', () => {
    expect(source).toContain('One of --project-id or --project-number is required.');
    expect(source).toContain('--region and --cloud-run-service are required.');
    expect(source).not.toContain('REGION="europe-west1"');
    expect(source).not.toContain('PROJECT_NUMBER_INPUT="511695074775"');
    expect(source).not.toContain('CLOUD_RUN_SERVICE="prooffleet"');
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
