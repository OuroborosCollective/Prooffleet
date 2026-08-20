import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '../scripts/bootstrap-gcp-deploy.sh');
const source = readFileSync(scriptPath, 'utf8');

describe('GCP deploy bootstrap safety contract', () => {
  it('defaults to dry-run and requires explicit --apply for mutations', () => {
    expect(source).toContain('APPLY=false');
    expect(source).toContain('--apply)');
    expect(source).toContain('apply_or_plan');
    expect(source).toContain('dry-run complete; no IAM, registry, Cloud Run, traffic or Firestore mutation was performed');
  });

  it('keeps deployment identity distinct from the existing Cloud Run runtime identity', () => {
    expect(source).toContain('DEPLOY_SERVICE_ACCOUNT_ID="prooffleet-deploy"');
    expect(source).toContain('DEPLOY_SA_EMAIL="${DEPLOY_SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"');
    expect(source).toContain('RUNTIME_SA="$(gcloud run services describe');
    expect(source).toContain('Refusing identity collapse: deployment and runtime service accounts must be distinct.');
    expect(source).not.toContain('compute@developer.gserviceaccount.com');
  });

  it('restricts GitHub OIDC admission to exactly the ProofFleet repository', () => {
    expect(source).toContain('GITHUB_REPO="OuroborosCollective/Prooffleet"');
    expect(source).toContain("EXPECTED_CONDITION=\"assertion.repository == '${GITHUB_REPO}'\"");
    expect(source).toContain('attribute.repository=assertion.repository');
    expect(source).toContain('roles/iam.workloadIdentityUser');
  });

  it('uses resource-scoped least-privilege deployment roles and no broad admin roles', () => {
    expect(source).toContain('gcloud artifacts repositories add-iam-policy-binding "$ARTIFACT_REPOSITORY"');
    expect(source).toContain('roles/artifactregistry.writer');
    expect(source).toContain('gcloud run services add-iam-policy-binding "$CLOUD_RUN_SERVICE"');
    expect(source).toContain('roles/run.developer');
    expect(source).toContain('gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA"');
    expect(source).toContain('roles/iam.serviceAccountUser');

    for (const forbiddenRole of [
      'roles/owner',
      'roles/editor',
      'roles/run.admin',
      'roles/artifactregistry.admin',
      'roles/iam.serviceAccountAdmin',
    ]) {
      expect(source).not.toContain(forbiddenRole);
    }
    expect(source).not.toMatch(/gcloud\s+projects\s+add-iam-policy-binding/);
  });

  it('never creates service-account keys, Firestore resources, Cloud Run revisions or traffic changes', () => {
    expect(source).not.toMatch(/service-accounts\s+keys\s+create/i);
    expect(source).not.toMatch(/credentials_json/i);
    expect(source).not.toMatch(/gcloud\s+firestore\b/i);
    expect(source).not.toMatch(/gcloud\s+run\s+deploy\b/i);
    expect(source).not.toMatch(/gcloud\s+run\s+services\s+update-traffic\b/i);
    expect(source).not.toContain('LATEST=100');
  });

  it('does not hardcode the owner cloud project, region, service or runtime service account', () => {
    expect(source).toContain('One of --project-id or --project-number is required.');
    expect(source).toContain('--region and --cloud-run-service are required.');
    expect(source).not.toContain('511695074775');
    expect(source).not.toContain('REGION="europe-west1"');
    expect(source).not.toContain('CLOUD_RUN_SERVICE="prooffleet"');
  });

  it('executes only provider readbacks in default dry-run while printing mutations as plans', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'prooffleet-gcp-deploy-'));
    const fakeGcloud = join(sandbox, 'gcloud');
    const gcloudLog = join(sandbox, 'gcloud.log');

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

if [[ "\${1:-}" == "run" && "\${2:-}" == "services" && "\${3:-}" == "describe" ]]; then
  for arg in "$@"; do
    if [[ "$arg" == '--format=value(spec.template.spec.serviceAccountName)' ]]; then
      echo 'runtime@proofleet-test-12345.iam.gserviceaccount.com'
      exit 0
    fi
  done
  exit 0
fi

if [[ "\${1:-}" == "iam" && "\${2:-}" == "service-accounts" && "\${3:-}" == "describe" ]]; then
  exit 1
fi

if [[ "\${1:-}" == "iam" && "\${2:-}" == "workload-identity-pools" && "\${3:-}" == "describe" ]]; then
  exit 1
fi

if [[ "\${1:-}" == "iam" && "\${2:-}" == "workload-identity-pools" && "\${3:-}" == "providers" && "\${4:-}" == "describe" ]]; then
  exit 1
fi

if [[ "\${1:-}" == "services" && "\${2:-}" == "list" ]]; then
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
        [
          scriptPath,
          '--project-id',
          'proofleet-test-12345',
          '--region',
          'europe-west1',
          '--cloud-run-service',
          'prooffleet',
        ],
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
      expect(result.stdout).toContain('[proofleet-deploy] mode=dry-run');
      expect(result.stdout).toContain('[dry-run] gcloud services enable');
      expect(result.stdout).toContain('roles/artifactregistry.writer');
      expect(result.stdout).toContain('roles/run.developer');
      expect(result.stdout).toContain('roles/iam.serviceAccountUser');
      expect(result.stdout).toContain('PROOFFLEET_GCP_DEPLOY_SERVICE_ACCOUNT=prooffleet-deploy@proofleet-test-12345.iam.gserviceaccount.com');
      expect(result.stdout).toContain('dry-run complete; no IAM, registry, Cloud Run, traffic or Firestore mutation was performed');

      const actualCalls = readFileSync(gcloudLog, 'utf8');
      expect(actualCalls).toContain('projects describe proofleet-test-12345');
      expect(actualCalls).toContain('run services describe prooffleet');
      expect(actualCalls).toContain('services list --enabled');

      for (const forbiddenMutation of [
        /services enable/,
        /service-accounts create/,
        /workload-identity-pools create/,
        /providers create-oidc/,
        /repositories create/,
        /add-iam-policy-binding/,
        /run deploy/,
        /update-traffic/,
        /firestore/,
      ]) {
        expect(actualCalls).not.toMatch(forbiddenMutation);
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
