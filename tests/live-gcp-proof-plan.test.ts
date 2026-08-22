import { describe, expect, it } from 'vitest';
import { LIVE_GCP_CONFIRMATION, buildLiveGcpProofPlan } from '../server/gcp/liveProof';

const SHA = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);
const PROJECT_NUMBER = '123456789012';
const WIF_PROVIDER = `projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo`;
const WIF_SERVICE_ACCOUNT = 'prooffleet-github@prooffleet-test1.iam.gserviceaccount.com';

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GCP_PROJECT_ID: 'prooffleet-test1',
    PROOFFLEET_GCP_PROJECT_NUMBER: PROJECT_NUMBER,
    GCP_REGION: 'europe-west1',
    GCP_WIF_PROVIDER: WIF_PROVIDER,
    GCP_WIF_SERVICE_ACCOUNT: WIF_SERVICE_ACCOUNT,
    PROOFFLEET_WIF_PRINCIPAL: WIF_SERVICE_ACCOUNT,
    PROOFFLEET_CLOUDRUN_SERVICE: 'prooffleet',
    PROOFFLEET_FIRESTORE_COLLECTION: 'proof-effects',
    PROOFFLEET_SOURCE_REVISION: SHA,
    GITHUB_SHA: SHA,
    GITHUB_REPOSITORY_ID: '1339097875',
    GITHUB_REPOSITORY_OWNER_ID: '266194342',
    GITHUB_ACTOR_ID: '266194342',
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '1',
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    RUNNER_NAME: 'GitHub Actions 100',
    PROOFFLEET_LIVE_CONFIRMATION: '',
    ...overrides,
  };
}

describe('Live GCP proof plan', () => {
  it('binds effect identity to exact source, repository, owner, actor, workflow run and authenticated GCP identity', () => {
    const plan = buildLiveGcpProofPlan(env());

    expect(plan.operation.parameters).toMatchObject({
      sourceRevision: SHA,
      repositoryId: '1339097875',
      repositoryOwnerId: '266194342',
      actorId: '266194342',
      workflowRunId: '12345',
      gcpProjectNumber: PROJECT_NUMBER,
      observedWifPrincipal: WIF_SERVICE_ACCOUNT,
    });
    expect(plan.operation.parameters).not.toHaveProperty('workflowRunAttempt');
    expect(plan.operation.parameters).not.toHaveProperty('executionIdentityHash');
    expect(plan.operation.parameters).not.toHaveProperty('workflowContextSha');
    expect(plan.executionIdentity.repositoryOwnerId).toBe('266194342');
    expect(plan.executionIdentity.sourceRevision).toBe(SHA);
    expect(plan.executionIdentity.workflowContextSha).toBe(SHA);
    expect(plan.gcpProjectNumber).toBe(PROJECT_NUMBER);
    expect(plan.observedWifPrincipal).toBe(WIF_SERVICE_ACCOUNT);
    expect(plan.operation.targetResource).toBe('firestore:proof-effects');
  });

  it('keeps Firestore effect identity stable across GitHub re-runs while execution evidence remains attempt-specific', () => {
    const first = buildLiveGcpProofPlan(env());
    const rerun = buildLiveGcpProofPlan(env({ GITHUB_RUN_ATTEMPT: '2' }));

    expect(first.executionIdentity.workflowRunAttempt).toBe('1');
    expect(rerun.executionIdentity.workflowRunAttempt).toBe('2');
    expect(first.executionIdentity.identityHash).not.toBe(rerun.executionIdentity.identityHash);
    expect(first.operation.operationId).toBe(rerun.operation.operationId);
    expect(first.operation.parametersHash).toBe(rerun.operation.parametersHash);
    expect(first.operation.missionId).toBe(rerun.operation.missionId);
  });

  it('binds a synthetic pull-request merge SHA as workflow context without confusing it with the checked source', () => {
    const direct = buildLiveGcpProofPlan(env());
    const pullRequest = buildLiveGcpProofPlan(env({ GITHUB_SHA: MERGE_SHA }));

    expect(pullRequest.sourceRevision).toBe(SHA);
    expect(pullRequest.executionIdentity.sourceRevision).toBe(SHA);
    expect(pullRequest.executionIdentity.workflowContextSha).toBe(MERGE_SHA);
    expect(pullRequest.executionIdentity.identityHash).not.toBe(direct.executionIdentity.identityHash);
    expect(pullRequest.operation.operationId).toBe(direct.operation.operationId);
    expect(pullRequest.operation.parametersHash).toBe(direct.operation.parametersHash);
  });

  it('rejects malformed workflow context instead of dropping it from execution evidence', () => {
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_SHA: 'merge-ref' })))
      .toThrow(/exact lowercase 40-character Git SHA/);
  });

  it('changes operation identity when immutable owner or actor authority changes', () => {
    const first = buildLiveGcpProofPlan(env());
    const ownerChanged = buildLiveGcpProofPlan(env({ GITHUB_REPOSITORY_OWNER_ID: '266194343' }));
    const actorChanged = buildLiveGcpProofPlan(env({ GITHUB_ACTOR_ID: '266194343' }));
    expect(first.operation.operationId).not.toBe(ownerChanged.operation.operationId);
    expect(first.operation.operationId).not.toBe(actorChanged.operation.operationId);
  });

  it('does not authorize a mutation without the exact workflow-dispatch phrase', () => {
    expect(buildLiveGcpProofPlan(env()).mutationApproved).toBe(false);
    expect(buildLiveGcpProofPlan(env({ PROOFFLEET_LIVE_CONFIRMATION: 'close enough' })).mutationApproved).toBe(false);
    expect(buildLiveGcpProofPlan(env({ PROOFFLEET_LIVE_CONFIRMATION: LIVE_GCP_CONFIRMATION })).mutationApproved).toBe(true);
  });

  it('does not use mutable actor display names or workflow paths as operation evidence', () => {
    const plan = buildLiveGcpProofPlan(env({
      GITHUB_ACTOR: 'mutable-owner-name',
      GITHUB_WORKFLOW: 'rename-me-any-time',
      GITHUB_WORKFLOW_REF: 'OuroborosCollective/Prooffleet/.github/workflows/renamed.yml@refs/heads/main',
    }));
    const serialized = JSON.stringify(plan.operation);
    expect(serialized).not.toContain('mutable-owner-name');
    expect(serialized).not.toContain('rename-me-any-time');
    expect(serialized).not.toContain('renamed.yml');
  });

  it('requires configured and authenticated WIF identities to agree exactly', () => {
    const plan = buildLiveGcpProofPlan(env());
    expect(plan.wifProvider).toBe(WIF_PROVIDER);
    expect(plan.wifServiceAccount).toBe(WIF_SERVICE_ACCOUNT);
    expect(() => buildLiveGcpProofPlan(env({ GCP_WIF_PROVIDER: 'provider-name-only' })))
      .toThrow('GCP_WIF_PROVIDER is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GCP_WIF_SERVICE_ACCOUNT: 'human@example.com' })))
      .toThrow('GCP_WIF_SERVICE_ACCOUNT is malformed');
    expect(() => buildLiveGcpProofPlan(env({ PROOFFLEET_WIF_PRINCIPAL: 'other@prooffleet-test1.iam.gserviceaccount.com' })))
      .toThrow('authenticated WIF principal does not match configured WIF service account');
  });

  it('fails if the WIF provider project number diverges from authenticated project readback', () => {
    expect(() => buildLiveGcpProofPlan(env({ PROOFFLEET_GCP_PROJECT_NUMBER: '999999999999' })))
      .toThrow('WIF provider project number does not match authenticated Google project readback');
    expect(() => buildLiveGcpProofPlan(env({ PROOFFLEET_GCP_PROJECT_NUMBER: 'project-number' })))
      .toThrow('PROOFFLEET_GCP_PROJECT_NUMBER is malformed');
  });

  it('rejects malformed cloud and execution identity before provider calls', () => {
    expect(() => buildLiveGcpProofPlan(env({ GCP_PROJECT_ID: 'BAD PROJECT' }))).toThrow('GCP_PROJECT_ID is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GCP_REGION: 'west' }))).toThrow('GCP_REGION is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_RUN_ID: 'run-1' }))).toThrow(/positive decimal identifier/);
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_ACTOR_ID: 'owner-name' }))).toThrow(/positive decimal identifier/);
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_REPOSITORY_ID: '0' }))).toThrow(/positive decimal identifier/);
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_REPOSITORY_OWNER_ID: '0' }))).toThrow(/positive decimal identifier/);
  });
});
