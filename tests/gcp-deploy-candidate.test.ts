import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-deploy-candidate.yml'), 'utf8');
const authority = readFileSync(join(here, '../scripts/authority-evidence.mjs'), 'utf8');
const dockerfile = readFileSync(join(here, '../Dockerfile'), 'utf8');

function workflowTriggerBlock(source: string): string {
  const match = source.match(/^on:\n([\s\S]*?)^permissions:/m);
  if (!match) throw new Error('workflow trigger block not found');
  return match[1];
}

describe('GCP candidate deploy safety contract', () => {
  it('uses the label only as an intent/routing signal and authorizes by immutable numeric identities before WIF', () => {
    const triggers = workflowTriggerBlock(workflow);
    expect(triggers).toMatch(/^  workflow_dispatch:/m);
    expect(triggers).toMatch(/^  pull_request:/m);
    expect(triggers).toContain('types:\n      - labeled');
    expect(triggers).not.toMatch(/^  push:/m);

    expect(workflow).toContain("github.event.label.name == 'proofleet-deploy-candidate'");
    expect(workflow).toContain("EXPECTED_GITHUB_REPOSITORY_ID: '1339097875'");
    expect(workflow).toContain("EXPECTED_GITHUB_OWNER_ID: '266194342'");
    expect(workflow).toContain("EXPECTED_GITHUB_ACTOR_ID: '266194342'");
    expect(workflow).toContain('EVENT_ACTOR_ID: ${{ github.actor_id }}');
    expect(workflow).toContain('REPOSITORY_ID: ${{ github.repository_id }}');
    expect(workflow).toContain('REPOSITORY_OWNER_ID: ${{ github.repository_owner_id }}');
    expect(workflow).toContain('PR_AUTHOR_ID: ${{ github.event.pull_request.user.id }}');
    expect(workflow).toContain('PR_HEAD_REPOSITORY_ID: ${{ github.event.pull_request.head.repo.id }}');
    expect(workflow).not.toContain("github.actor == 'OuroborosCollective'");
    expect(workflow).not.toContain("github.event.pull_request.user.login == 'OuroborosCollective'");
    expect(workflow).not.toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(workflow.indexOf('Fail closed on stale source or immutable identity mismatch'))
      .toBeLessThan(workflow.indexOf('Authenticate to Google Cloud using WIF'));
  });

  it('binds a pre-merge deployment to the exact PR source head and never treats the synthetic merge SHA as source', () => {
    expect(workflow).toContain("EXPECTED_SOURCE_REVISION: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || inputs.expected_source_revision }}");
    expect(workflow).toContain('ref: ${{ env.EXPECTED_SOURCE_REVISION }}');
    expect(workflow).toContain('ACTUAL_SOURCE_REVISION="$(git rev-parse HEAD)"');
    expect(workflow).toContain('test "$ACTUAL_SOURCE_REVISION" != "$EXPECTED_SOURCE_REVISION"');
    expect(workflow).toContain('deploy_source_revision=$EXPECTED_SOURCE_REVISION');
    expect(workflow).toContain('workflow_context_sha=$GITHUB_SHA');
    expect(workflow).toContain('Refusing stale manual deploy:');
  });

  it('captures run, attempt and runner identity in one hashed execution identity', () => {
    expect(workflow).toContain('buildGitHubExecutionIdentity');
    expect(workflow).toContain('candidate-execution-identity.json');
    expect(workflow).toContain('GITHUB_RUN_ID');
    expect(workflow).toContain('GITHUB_RUN_ATTEMPT');
    expect(workflow).toContain('RUNNER_NAME');
    expect(workflow).toContain('RUNNER_OS');
    expect(workflow).toContain('RUNNER_ARCH');
    expect(workflow).toContain('execution_identity_hash=${identity.identityHash}');
    expect(authority).toContain("schemaVersion: 'prooffleet.github-execution-identity.v1'");
    expect(authority).toContain('repositoryId');
    expect(authority).toContain('repositoryOwnerId');
    expect(authority).toContain('actorId');
    expect(authority).toContain('identityHash: sha256Hex(canonicalJson(body))');
  });

  it('uses WIF and proves the short-lived credential response without persisting or logging raw token material', () => {
    expect(workflow).toContain('id: auth');
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('token_format: access_token');
    expect(workflow).toContain('WIF_ACCESS_TOKEN: ${{ steps.auth.outputs.access_token }}');
    expect(workflow).toContain('WIF_CREDENTIALS_FILE: ${{ steps.auth.outputs.credentials_file_path }}');
    expect(workflow).toContain('buildCredentialEvidence');
    expect(workflow).toContain('https://run.googleapis.com/v2/${resourceName}');
    expect(workflow).toContain('gcp-credential-evidence.json');
    expect(workflow).toContain('token_sha256=${evidence.accessTokenSha256}');
    expect(workflow).not.toContain('credentials_json');
    expect(workflow).not.toContain('console.log(accessToken)');
    expect(workflow).not.toContain('writeFileSync(credentialPath, accessToken');

    expect(authority).toContain("config.type !== 'external_account'");
    expect(authority).toContain("config.token_url !== 'https://sts.googleapis.com/v1/token'");
    expect(authority).toContain('service_account_impersonation_url');
    expect(authority).toContain("for (const forbidden of ['private_key', 'private_key_id', 'client_email'])");
    expect(authority).toContain('accessTokenSha256: sha256Hex(token)');
    expect(authority).toContain('cloudRunResponseSha256');
  });

  it('requires independent credential and gcloud runtime-service-account readbacks to agree', () => {
    expect(workflow).toContain('CREDENTIAL_RUNTIME_SA=');
    expect(workflow).toContain('Runtime service-account readbacks disagree:');
    expect(workflow).toContain('cloudRunRuntimeServiceAccount');
    expect(workflow).not.toContain('511695074775-compute@developer.gserviceaccount.com');
  });

  it('builds an immutable source-SHA-tagged image and proves the OCI index to one linux/amd64 child manifest', () => {
    expect(workflow).toContain('docker/build-push-action@v6');
    expect(workflow).toContain('push: true');
    expect(workflow).toContain(':${{ env.EXPECTED_SOURCE_REVISION }}');
    expect(workflow).toContain("'^sha256:[0-9a-f]{64}$'");
    expect(workflow).toContain('IMAGE_INDEX_DIGEST: ${{ steps.build.outputs.digest }}');
    expect(workflow).toContain('docker buildx imagetools inspect "${IMAGE_REPOSITORY}@${IMAGE_INDEX_DIGEST}" --raw > "$INDEX_JSON"');
    expect(workflow).toContain("createHash('sha256').update(raw).digest('hex')");
    expect(workflow).toContain("platform.os === 'linux' && platform.architecture === 'amd64'");
    expect(workflow).toContain('runtimeCandidates.length !== 1');
    expect(workflow).toContain('runtime_image_digest=${runtimeImageDigest}');
  });

  it('keeps the candidate at zero normal traffic and binds a tagged URL to the exact source-derived tag', () => {
    expect(workflow).toContain('CANDIDATE_TAG="pf-${EXPECTED_SOURCE_REVISION:0:12}"');
    expect(workflow).toContain('gcloud run deploy "$PROOFFLEET_CLOUDRUN_SERVICE"');
    expect(workflow).toContain('--tag="$CANDIDATE_TAG"');
    expect(workflow).toContain('--no-traffic');
    expect(workflow).toContain('--container=app-container');
    expect(authority).toContain('candidate revision unexpectedly receives ${percent}% normal traffic');
    expect(authority).toContain("candidate tag url");
    expect(workflow).not.toContain('LATEST=100');
  });

  it('parses the direct deploy response through one strict shared parser and never prints full response JSON', () => {
    expect(workflow).toContain('DEPLOY_JSON="$RUNNER_TEMP/cloudrun-deploy-result.json"');
    expect(workflow).toContain('> "$DEPLOY_JSON"');
    expect(workflow).toContain('parseCandidateDeployResponse');
    expect(workflow).toContain('candidate-deploy-response-hash.txt');
    expect(workflow).toContain('deploy_response_sha256=${parsed.responseSha256}');
    expect(workflow).not.toContain('cat "$DEPLOY_JSON"');
    expect(workflow).not.toContain('gcloud run revisions list');
    expect(workflow).not.toContain('status?.latestCreatedRevisionName');

    expect(authority).toContain("deployed.spec?.template?.metadata?.name");
    expect(authority).toContain('direct deploy response labels drifted');
    expect(authority).toContain('direct deploy response container shape drifted');
    expect(authority).toContain('direct deploy response source env mismatch');
  });

  it('requires exact revision uid, service uid, runtime child digest, runtime identity and provider Ready readback', () => {
    expect(workflow).toContain('parseCandidateRevisionReadback');
    expect(workflow).toContain('parseCandidateServiceTrafficReadback');
    expect(workflow).toContain('revisionUid: revision.revisionUid');
    expect(workflow).toContain('serviceUid: service.serviceUid');
    expect(workflow).toContain('revisionReadbackSha256: revision.responseSha256');
    expect(workflow).toContain('serviceReadbackSha256: service.responseSha256');
    expect(workflow).toContain('Cloud Run service uid differs between credential probe and deployment readback');
    expect(workflow).toContain('runtime service account differs between credential probe and revision readback');

    expect(authority).toContain("revision.metadata?.uid");
    expect(authority).toContain("revision.spec?.serviceAccountName");
    expect(authority).not.toContain("revision.spec?.template?.spec?.serviceAccountName ||");
    expect(authority).toContain('candidate revision is not provider-Ready');
    expect(authority).toContain('revision image is not the registry-proven runtime manifest');
  });

  it('fails closed if inherited environment names disappear during the merge deploy', () => {
    expect(workflow).toContain('--update-env-vars="PROOFFLEET_SOURCE_REVISION=$EXPECTED_SOURCE_REVISION"');
    expect(workflow).toContain('env-names-before.txt');
    expect(workflow).toContain('upstream environment variable disappeared during merge deploy');
  });

  it('reads source-bound ADK status without triggering a model call from the deploy workflow', () => {
    expect(workflow).toContain('"$CANDIDATE_URL/api/runtime/adk-canary" > "$RUNNER_TEMP/candidate-adk-canary.json"');
    expect(workflow).toContain('canary.eligible !== true');
    expect(workflow).toContain('canary.sourceRevision !== expectedSourceRevision');
    expect(workflow).toContain("!['NOT_RUN', 'OBSERVED'].includes(canary.status)");
    expect(workflow).toContain("observed.outcome !== 'ADK_RUNTIME_OBSERVED'");
    expect(workflow).toContain("observed.framework !== 'google-adk'");
    expect(workflow).toContain("observed.modelId !== 'gemini-3.7-flash'");
    expect(workflow).not.toContain('x-prooffleet-canary-intent');
    expect(workflow).not.toContain('GOOGLE_API_KEY');
    expect(workflow).not.toContain('GEMINI_API_KEY');
  });

  it('produces a sealed v3 receipt binding execution, credential, provider and response identities', () => {
    expect(workflow).toContain("schemaVersion: 'prooffleet.gcp-deploy-candidate.v3'");
    expect(workflow).toContain("outcome: 'OBSERVED_NO_TRAFFIC_CANDIDATE'");
    expect(workflow).toContain('githubExecutionIdentityHash: executionIdentity.identityHash');
    expect(workflow).toContain('githubRepositoryId: executionIdentity.repositoryId');
    expect(workflow).toContain('githubActorId: executionIdentity.actorId');
    expect(workflow).toContain('githubRunId: executionIdentity.runId');
    expect(workflow).toContain('githubRunAttempt: executionIdentity.runAttempt');
    expect(workflow).toContain('credentialEvidenceHash: credentialEvidence.evidenceHash');
    expect(workflow).toContain('credentialConfigSha256: credentialEvidence.credentialConfigSha256');
    expect(workflow).toContain('accessTokenSha256: credentialEvidence.accessTokenSha256');
    expect(workflow).toContain('deployResponseSha256:');
    expect(workflow).toContain('revisionReadbackSha256:');
    expect(workflow).toContain('serviceReadbackSha256:');
    expect(workflow).toContain('sealReceipt({');
    expect(workflow).toContain('receipt_hash=${sealed.receiptHash}');
  });

  it('binds the uploaded GitHub artifact id/digest to the sealed receipt and exact execution identity', () => {
    expect(workflow).toContain('id: candidate_receipt_artifact');
    expect(workflow).toContain('steps.candidate_receipt_artifact.outputs.artifact-id');
    expect(workflow).toContain('steps.candidate_receipt_artifact.outputs.artifact-digest');
    expect(workflow).toContain('buildArtifactBinding');
    expect(workflow).toContain('gcp-deploy-candidate-artifact-binding.json');
    expect(workflow).toContain('prooffleet-gcp-deploy-candidate-binding-');
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
