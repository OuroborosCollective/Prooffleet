import { describe, expect, it } from 'vitest';

import {
  LIVE_GCP_CONFIRMATION,
  buildLiveGcpProofPlan,
} from '../server/gcp/liveProof';

const SHA = 'a'.repeat(40);

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GCP_PROJECT_ID: 'prooffleet-test1',
    GCP_REGION: 'europe-west1',
    PROOFFLEET_CLOUDRUN_SERVICE: 'prooffleet',
    PROOFFLEET_FIRESTORE_COLLECTION: 'proof-effects',
    PROOFFLEET_SOURCE_REVISION: SHA,
    GITHUB_SHA: SHA,
    GITHUB_REPOSITORY_ID: '1339097875',
    GITHUB_RUN_ID: '12345',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_ACTOR_ID: '266194342',
    GITHUB_ACTOR: 'owner-user',
    RUNNER_NAME: 'GitHub Actions 1000123456',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    PROOFFLEET_LIVE_CONFIRMATION: '',
    ...overrides,
  };
}

describe('Live GCP proof plan', () => {
  it('binds operation identity to exact source and immutable GitHub repository/run/actor ids', () => {
    const first = buildLiveGcpProofPlan(env());
    const second = buildLiveGcpProofPlan(env({
      PROOFFLEET_SOURCE_REVISION: 'b'.repeat(40),
      GITHUB_SHA: 'b'.repeat(40),
    }));
    const third = buildLiveGcpProofPlan(env({ GITHUB_ACTOR_ID: '999999' }));

    expect(first.operation.parameters.sourceRevision).toBe(SHA);
    expect(first.operation.parameters.githubRepositoryId).toBe('1339097875');
    expect(first.operation.operationId).not.toBe(second.operation.operationId);
    expect(first.operation.operationId).not.toBe(third.operation.operationId);
    expect(first.operation.targetResource).toBe('firestore:proof-effects');
  });

  it('keeps one durable operation id across retry attempts but binds each attempt and runner separately', () => {
    const first = buildLiveGcpProofPlan(env({
      GITHUB_RUN_ATTEMPT: '1',
      RUNNER_NAME: 'GitHub Actions runner-a',
    }));
    const retry = buildLiveGcpProofPlan(env({
      GITHUB_RUN_ATTEMPT: '2',
      RUNNER_NAME: 'GitHub Actions runner-b',
    }));

    expect(first.operation.operationId).toBe(retry.operation.operationId);
    expect(first.executionContextHash).not.toBe(retry.executionContextHash);
    expect(first.runnerNameHash).not.toBe(retry.runnerNameHash);
  });

  it('does not authorize a mutation without the exact workflow-dispatch phrase', () => {
    expect(buildLiveGcpProofPlan(env()).mutationApproved).toBe(false);
    expect(buildLiveGcpProofPlan(env({
      PROOFFLEET_LIVE_CONFIRMATION: 'close enough',
    })).mutationApproved).toBe(false);
    expect(buildLiveGcpProofPlan(env({
      PROOFFLEET_LIVE_CONFIRMATION: LIVE_GCP_CONFIRMATION,
    })).mutationApproved).toBe(true);
  });

  it('fails closed when workflow SHA and declared source revision diverge', () => {
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_SHA: 'b'.repeat(40) })))
      .toThrow('must equal the exact workflow GITHUB_SHA');
  });

  it('does not bind mutable GitHub actor names into operation or execution identity', () => {
    const first = buildLiveGcpProofPlan(env({ GITHUB_ACTOR: 'old-owner-name' }));
    const renamed = buildLiveGcpProofPlan(env({ GITHUB_ACTOR: 'renamed-owner' }));

    expect(first.operation.operationId).toBe(renamed.operation.operationId);
    expect(first.executionContextHash).toBe(renamed.executionContextHash);
    expect(JSON.stringify(first.operation)).not.toContain('owner-user');
    expect(first.githubActorIdHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects malformed cloud or immutable execution configuration before any provider call', () => {
    expect(() => buildLiveGcpProofPlan(env({ GCP_PROJECT_ID: 'BAD PROJECT' })))
      .toThrow('GCP_PROJECT_ID is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GCP_REGION: 'west' })))
      .toThrow('GCP_REGION is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_RUN_ID: 'run-1' })))
      .toThrow('GITHUB_RUN_ID must be a positive numeric identity');
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_ACTOR_ID: 'owner-user' })))
      .toThrow('GITHUB_ACTOR_ID must be a positive numeric identity');
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_REPOSITORY_ID: '' })))
      .toThrow('GITHUB_REPOSITORY_ID is required');
  });
});
