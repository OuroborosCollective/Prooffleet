import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-deploy-candidate.yml'), 'utf8');
const dockerfile = readFileSync(join(here, '../Dockerfile'), 'utf8');

function workflowTriggerBlock(source: string): string {
  const match = source.match(/^on:\n([\s\S]*?)^permissions:/m);
  if (!match) throw new Error('workflow trigger block not found');
  return match[1];
}

describe('GCP candidate deploy safety contract', () => {
  it('supports post-merge manual dispatch and only owner-labeled pull requests before merge', () => {
    const triggers = workflowTriggerBlock(workflow);
    expect(triggers).toMatch(/^  workflow_dispatch:/m);
    expect(triggers).toMatch(/^  pull_request:/m);
    expect(triggers).toContain('types:\n      - labeled');
    expect(triggers).not.toMatch(/^  push:/m);
    expect(triggers).not.toContain('- opened');
    expect(triggers).not.toContain('- synchronize');
    expect(triggers).not.toContain('- reopened');

    expect(workflow).toContain("github.event.label.name == 'proofleet-deploy-candidate'");
    expect(workflow).toContain("github.actor == 'OuroborosCollective'");
    expect(workflow).toContain("github.event.pull_request.user.login == 'OuroborosCollective'");
    expect(workflow).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(workflow).toContain('I_APPROVE_PROOFFLEET_CANDIDATE_DEPLOY');
  });

  it('binds a pre-merge deployment to the PR source head and never to the synthetic merge SHA', () => {
    expect(workflow).toContain("EXPECTED_SOURCE_REVISION: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || inputs.expected_source_revision }}");
    expect(workflow).toContain('ref: ${{ env.EXPECTED_SOURCE_REVISION }}');
    expect(workflow).toContain('ACTUAL_SOURCE_REVISION="$(git rev-parse HEAD)"');
    expect(workflow).toContain('test "$ACTUAL_SOURCE_REVISION" != "$EXPECTED_SOURCE_REVISION"');
    expect(workflow).toContain('deploy_source_revision=$EXPECTED_SOURCE_REVISION');
    expect(workflow).toContain('workflow_context_sha=$GITHUB_SHA');
    expect(workflow).toContain('Refusing stale manual deploy:');
  });

  it('uses WIF and never accepts a long-lived service-account JSON credential', () => {
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('GCP_DEPLOY_SERVICE_ACCOUNT');
    expect(workflow).not.toContain('credentials_json');
    expect(workflow).not.toContain('GOOGLE_APPLICATION_CREDENTIALS=');
  });

  it('builds an immutable source-SHA-tagged image and requires a sha256 OCI index digest', () => {
    expect(workflow).toContain('docker/build-push-action@v6');
    expect(workflow).toContain('push: true');
    expect(workflow).toContain(':${{ env.EXPECTED_SOURCE_REVISION }}');
    expect(workflow).toContain("'^sha256:[0-9a-f]{64}$'");
    expect(workflow).toContain('IMAGE_INDEX_DIGEST: ${{ steps.build.outputs.digest }}');
    expect(workflow).toContain('IMMUTABLE_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${PROOFFLEET_ARTIFACT_REPOSITORY}/${PROOFFLEET_CLOUDRUN_SERVICE}@${IMAGE_INDEX_DIGEST}"');
    expect(workflow).toContain('--image="$IMMUTABLE_IMAGE"');
  });

  it('proves the immutable OCI index and resolves exactly one linux/amd64 runtime child manifest', () => {
    expect(workflow).toContain('Resolve exact linux amd64 runtime manifest from immutable index');
    expect(workflow).toContain('docker buildx imagetools inspect "${IMAGE_REPOSITORY}@${IMAGE_INDEX_DIGEST}" --raw > "$INDEX_JSON"');
    expect(workflow).toContain("const { createHash } = require('crypto')");
    expect(workflow).toContain("createHash('sha256').update(raw).digest('hex')");
    expect(workflow).toContain('observedIndexDigest !== expectedIndexDigest');
    expect(workflow).toContain("platform.os === 'linux' && platform.architecture === 'amd64'");
    expect(workflow).toContain('runtimeCandidates.length !== 1');
    expect(workflow).toContain('runtime_image_digest=${runtimeImageDigest}');
    expect(workflow).toContain('image_index_digest=${expectedIndexDigest}');
  });

  it('derives a unique tagged URL from the exact source SHA while keeping normal traffic at zero', () => {
    expect(workflow).toContain('CANDIDATE_TAG="pf-${EXPECTED_SOURCE_REVISION:0:12}"');
    expect(workflow).toContain('echo "candidate_tag=$CANDIDATE_TAG" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain('gcloud run deploy "$PROOFFLEET_CLOUDRUN_SERVICE"');
    expect(workflow).toContain('--tag="$CANDIDATE_TAG"');
    expect(workflow).toContain('--no-traffic');
    expect(workflow).toContain('--container=app-container');
    expect(workflow).toContain('candidate revision unexpectedly receives ${percent}% normal traffic');
    expect(workflow).toContain('candidate tag URL missing for ${candidateTag}');
    expect(workflow).not.toContain('revision_traffic:');
    expect(workflow).not.toContain('tag_traffic:');
    expect(workflow).not.toContain('LATEST=100');
  });

  it('binds candidate identity to the direct deploy response before any independent revision readback', () => {
    expect(workflow).toContain('DEPLOY_JSON="$RUNNER_TEMP/cloudrun-deploy-result.json"');
    expect(workflow).toContain('> "$DEPLOY_JSON"');
    expect(workflow).toContain("const revision = String(deployed.spec?.template?.metadata?.name || '')");
    expect(workflow).toContain("labels['prooffleet-source-sha'] !== expectedSha");
    expect(workflow).toContain("String(labels['prooffleet-candidate']) !== 'true'");
    expect(workflow).toContain('image.includes(`@${expectedIndexDigest}`)');
    expect(workflow).toContain('direct deploy response source env mismatch');
    expect(workflow).toContain('gcloud run revisions describe "$REVISION"');
    expect(workflow).not.toContain('gcloud run revisions list');
    expect(workflow).not.toContain('status?.latestCreatedRevisionName');
  });

  it('requires Cloud Run to resolve exactly the registry-proven runtime child digest', () => {
    expect(workflow).toContain('RUNTIME_IMAGE_DIGEST: ${{ steps.registry.outputs.runtime_image_digest }}');
    expect(workflow).toContain('IMAGE_INDEX_DIGEST: ${{ steps.registry.outputs.image_index_digest }}');
    expect(workflow).toContain('const expectedRuntimeImage = `${process.env.GCP_REGION}-docker.pkg.dev/${process.env.GCP_PROJECT_ID}/${process.env.PROOFFLEET_ARTIFACT_REPOSITORY}/${process.env.PROOFFLEET_CLOUDRUN_SERVICE}@${expectedRuntimeDigest}`');
    expect(workflow).toContain('image !== expectedRuntimeImage');
    expect(workflow).toContain('registry-proven linux/amd64 manifest');
  });

  it('never prints the full deploy response that may contain inherited environment values', () => {
    expect(workflow).toContain('DEPLOY_JSON="$RUNNER_TEMP/cloudrun-deploy-result.json"');
    expect(workflow).toContain('--format=json');
    expect(workflow).toContain('> "$DEPLOY_JSON"');
    expect(workflow).not.toContain('cat "$DEPLOY_JSON"');
    expect(workflow).not.toContain('cat $DEPLOY_JSON');
    expect(workflow).toContain('full deploy response retained only in runner temp');
  });

  it('requires provider Ready state, revision labels and an exact tagged HTTP health smoke before promotion', () => {
    expect(workflow).toContain("c.type === 'Ready' && String(c.status).toLowerCase() === 'true'");
    expect(workflow).toContain("labels['prooffleet-source-sha'] !== expectedSha");
    expect(workflow).toContain("String(labels['prooffleet-candidate']) !== 'true'");
    expect(workflow).toContain('Smoke exact tagged candidate over HTTP before promotion');
    expect(workflow).toContain('"$CANDIDATE_URL/api/health"');
    expect(workflow).toContain('Tagged no-traffic candidate never passed /api/health.');
    expect(workflow).toContain('receipt.httpHealthObserved = true');
    expect(workflow).toContain("receipt.healthEndpoint = '/api/health'");
    expect(workflow).toContain('[candidate-smoke] exact tagged candidate passed /api/health');
  });

  it('reads source-bound ADK canary eligibility without triggering a model call from the deploy workflow', () => {
    expect(workflow).toContain('"$CANDIDATE_URL/api/runtime/adk-canary" > "$RUNNER_TEMP/candidate-adk-canary.json"');
    expect(workflow).toContain('canary.eligible !== true');
    expect(workflow).toContain('canary.sourceRevision !== expectedSourceRevision');
    expect(workflow).toContain("!['NOT_RUN', 'OBSERVED'].includes(canary.status)");
    expect(workflow).toContain("observed.outcome !== 'ADK_RUNTIME_OBSERVED'");
    expect(workflow).toContain("observed.framework !== 'google-adk'");
    expect(workflow).toContain("observed.modelId !== 'gemini-3.7-flash'");
    expect(workflow).toContain("receipt.adkCanaryObserved = canary.status === 'OBSERVED'");
    expect(workflow).toContain("receipt.adkCanaryEndpoint = '/api/runtime/adk-canary'");
    expect(workflow).not.toContain('x-prooffleet-canary-intent');
    expect(workflow).not.toContain('GOOGLE_API_KEY');
    expect(workflow).not.toContain('GEMINI_API_KEY');
  });

  it('merges only the exact source revision into upstream environment instead of replacing AI Studio config', () => {
    expect(workflow).toContain('--update-env-vars="PROOFFLEET_SOURCE_REVISION=$EXPECTED_SOURCE_REVISION"');
    expect(workflow).toContain('env-names-before.txt');
    expect(workflow).toContain('upstream environment variable disappeared during merge deploy');
  });

  it('fails if deployment changes the existing Cloud Run runtime service account', () => {
    expect(workflow).toContain('runtime-sa-before.txt');
    expect(workflow).toContain('runtime service account changed:');
    expect(workflow).not.toContain('511695074775-compute@developer.gserviceaccount.com');
  });

  it('produces a v2 receipt with index-to-runtime-manifest evidence before HTTP or ADK observation', () => {
    expect(workflow).toContain("schemaVersion: 'prooffleet.gcp-deploy-candidate.v2'");
    expect(workflow).toContain("outcome: 'OBSERVED_NO_TRAFFIC_CANDIDATE'");
    expect(workflow).toContain('imageDigest: expectedRuntimeDigest');
    expect(workflow).toContain('imageIndexDigest: expectedIndexDigest');
    expect(workflow).toContain('runtimeImageDigest: expectedRuntimeDigest');
    expect(workflow).toContain("runtimePlatform: 'linux/amd64'");
    expect(workflow).toContain('imageIndexToRuntimeManifestVerified: true');
    expect(workflow).toContain('providerReady: true');
    expect(workflow).toContain('httpHealthObserved: false');
    expect(workflow).toContain('adkCanaryEligible: false');
    expect(workflow).toContain('adkCanaryObserved: false');
    expect(workflow).toContain('receipt.httpHealthObserved = true');
    expect(workflow).toContain("receipt.adkCanaryObserved = canary.status === 'OBSERVED'");
    expect(workflow).toContain('Upload candidate deployment receipt');
  });

  it('produces a minimal production image from the immutable npm graph', () => {
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS build');
    expect(dockerfile).toContain('RUN npm ci --no-audit --no-fund');
    expect(dockerfile).toContain('RUN npm run build');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --no-audit --no-fund');
    expect(dockerfile).toContain('COPY --from=build /app/dist ./dist');
    expect(dockerfile).toContain('EXPOSE 8080');
    expect(dockerfile).toContain('CMD ["node", "dist/server.cjs"]');
  });
});
