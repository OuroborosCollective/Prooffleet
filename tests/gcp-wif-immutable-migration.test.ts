import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '../scripts/migrate-gcp-wif-immutable-ids.sh');
const source = readFileSync(scriptPath, 'utf8');

describe('immutable-ID WIF migration safety contract', () => {
  it('uses GitHub numeric owner and repository IDs as the provider admission boundary', () => {
    expect(source).toContain('GITHUB_REPOSITORY_ID="1339097875"');
    expect(source).toContain('GITHUB_REPOSITORY_OWNER_ID="266194342"');
    expect(source).toContain("assertion.repository_owner_id == '${GITHUB_REPOSITORY_OWNER_ID}'");
    expect(source).toContain("assertion.repository_id == '${GITHUB_REPOSITORY_ID}'");
    expect(source).toContain('attribute.repository_id=assertion.repository_id');
    expect(source).toContain('attribute.repository_owner_id=assertion.repository_owner_id');
    expect(source).toContain('/attribute.repository_id/${GITHUB_REPOSITORY_ID}');
    expect(source).not.toContain("EXPECTED_CONDITION=\"assertion.repository == '");
  });

  it('updates the existing provider in place and validates authoritative readback', () => {
    expect(source).toContain('providers update-oidc');
    expect(source).toContain('--attribute-mapping="$EXPECTED_MAPPING"');
    expect(source).toContain('--attribute-condition="$EXPECTED_CONDITION"');
    expect(source).toContain('read_provider');
    expect(source).toContain('provider_matches');
    expect(source).toContain('Provider update did not survive authoritative readback.');
    expect(source).not.toContain('providers create-oidc');
    expect(source).not.toContain('workload-identity-pools create');
  });

  it('adds and reads back numeric principal bindings before removing legacy name bindings', () => {
    const addIndex = source.indexOf('add-iam-policy-binding "$service_account"');
    const verifyIndex = source.indexOf('policy_has_member "$policy_path" "$IMMUTABLE_PRINCIPAL_SET" ||');
    const removeIndex = source.indexOf('remove-iam-policy-binding "$service_account"');
    expect(addIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(addIndex);
    expect(removeIndex).toBeGreaterThan(verifyIndex);
    expect(source).toContain('Refusing to remove legacy binding before immutable binding readback.');
    expect(source).toContain('Legacy name-based principal remains after removal.');
  });

  it('targets both deployment and live-proof identities without touching their resource roles', () => {
    expect(source).toContain('prooffleet-deploy@${PROJECT_ID}.iam.gserviceaccount.com');
    expect(source).toContain('prooffleet-github@${PROJECT_ID}.iam.gserviceaccount.com');
    expect(source).toContain('roles/iam.workloadIdentityUser');
    expect(source).not.toContain('roles/run.developer');
    expect(source).not.toContain('roles/run.viewer');
    expect(source).not.toContain('roles/datastore.user');
    expect(source).not.toContain('roles/artifactregistry.writer');
  });

  it('never creates keys, providers, service accounts, revisions, Firestore writes or traffic changes', () => {
    for (const forbidden of [
      /service-accounts\s+keys\s+create/i,
      /service-accounts\s+create/i,
      /providers\s+create-oidc/i,
      /workload-identity-pools\s+create/i,
      /gcloud\s+run\s+deploy/i,
      /gcloud\s+firestore/i,
      /update-traffic/i,
      /credentials_json/i,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it('performs only readbacks in default mode and prints the exact migration plan', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'prooffleet-wif-migration-'));
    const fakeGcloud = join(sandbox, 'gcloud');
    const gcloudLog = join(sandbox, 'gcloud.log');
    const legacyMember =
      'principalSet://iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/prooffleet-github/attribute.repository/OuroborosCollective/Prooffleet';

    writeFileSync(
      fakeGcloud,
      `#!/usr/bin/env bash
set -euo pipefail
: "\${GCLOUD_LOG:?}"
printf '%q ' "$@" >> "$GCLOUD_LOG"
printf '\\n' >> "$GCLOUD_LOG"

if [[ "\${1:-}" == "projects" && "\${2:-}" == "describe" ]]; then
  for arg in "$@"; do
    case "$arg" in
      --format=value\\(projectId\\)) echo 'proofleet-test-12345'; exit 0 ;;
      --format=value\\(projectNumber\\)) echo '123456789012'; exit 0 ;;
    esac
  done
  exit 99
fi

if [[ "\${1:-}" == "iam" && "\${2:-}" == "workload-identity-pools" && "\${3:-}" == "providers" && "\${4:-}" == "describe" ]]; then
  cat <<'JSON'
{"name":"projects/123456789012/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo","state":"ACTIVE","oidc":{"issuerUri":"https://token.actions.githubusercontent.com"},"attributeMapping":{"google.subject":"assertion.sub","attribute.repository":"assertion.repository","attribute.repository_owner":"assertion.repository_owner","attribute.ref":"assertion.ref"},"attributeCondition":"assertion.repository == 'OuroborosCollective/Prooffleet'"}
JSON
  exit 0
fi

if [[ "\${1:-}" == "iam" && "\${2:-}" == "service-accounts" && "\${3:-}" == "describe" ]]; then
  exit 0
fi

if [[ "\${1:-}" == "iam" && "\${2:-}" == "service-accounts" && "\${3:-}" == "get-iam-policy" ]]; then
  printf '%s\\n' '{"bindings":[{"role":"roles/iam.workloadIdentityUser","members":["${legacyMember}"]}]}'
  exit 0
fi

echo "unexpected fake gcloud call: $*" >&2
exit 99
`,
      'utf8',
    );
    chmodSync(fakeGcloud, 0o755);

    try {
      const result = spawnSync(
        'bash',
        [scriptPath, '--project-id', 'proofleet-test-12345'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${sandbox}:${process.env.PATH ?? ''}`,
            GCLOUD_LOG: gcloudLog,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('[proofleet-wif-migration] mode=dry-run');
      expect(result.stdout).toContain('[dry-run] gcloud iam workload-identity-pools providers update-oidc');
      expect(result.stdout).toContain('attribute.repository_id=assertion.repository_id');
      expect(result.stdout).toContain('[dry-run] gcloud iam service-accounts add-iam-policy-binding');
      expect(result.stdout).toContain('[dry-run] gcloud iam service-accounts remove-iam-policy-binding');
      expect(result.stdout).toContain('migration_status=PLAN_ONLY');

      const actualCalls = readFileSync(gcloudLog, 'utf8');
      expect(actualCalls).toContain('projects describe proofleet-test-12345');
      expect(actualCalls).toContain('providers describe prooffleet-repo');
      expect(actualCalls).toContain('service-accounts get-iam-policy');
      for (const forbiddenMutation of [
        /providers update-oidc/,
        /add-iam-policy-binding/,
        /remove-iam-policy-binding/,
        /service-accounts create/,
        /run deploy/,
        /firestore/,
        /update-traffic/,
      ]) {
        expect(actualCalls).not.toMatch(forbiddenMutation);
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
