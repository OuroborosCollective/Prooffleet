import { describe, expect, it } from 'vitest';
import { LIVE_GCP_CONFIRMATION, buildLiveGcpProofPlan } from '../server/gcp/liveProof';

const SHA = 'a'.repeat(40);
function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GCP_PROJECT_ID: 'prooffleet-test1', GCP_REGION: 'europe-west1',
    PROOFFLEET_CLOUDRUN_SERVICE: 'prooffleet', PROOFFLEET_FIRESTORE_COLLECTION: 'proof-effects',
    PROOFFLEET_SOURCE_REVISION: SHA, GITHUB_SHA: SHA, GITHUB_RUN_ID: '12345',
    GITHUB_ACTOR: 'mutable-owner-name', GITHUB_ACTOR_ID: '266194342', PROOFFLEET_LIVE_CONFIRMATION: '', ...overrides,
  };
}

describe('Live GCP proof plan', () => {
  it('binds operation identity to exact workflow source revision', () => {
    const first = buildLiveGcpProofPlan(env());
    const second = buildLiveGcpProofPlan(env({ PROOFFLEET_SOURCE_REVISION: 'b'.repeat(40), GITHUB_SHA: 'b'.repeat(40) }));
    expect(first.operation.parameters.sourceRevision).toBe(SHA);
    expect(first.operation.operationId).not.toBe(second.operation.operationId);
    expect(first.operation.targetResource).toBe('firestore:proof-effects');
  });

  it('does not authorize a mutation without the exact workflow-dispatch phrase', () => {
    expect(buildLiveGcpProofPlan(env()).mutationApproved).toBe(false);
    expect(buildLiveGcpProofPlan(env({ PROOFFLEET_LIVE_CONFIRMATION: 'close enough' })).mutationApproved).toBe(false);
    expect(buildLiveGcpProofPlan(env({ PROOFFLEET_LIVE_CONFIRMATION: LIVE_GCP_CONFIRMATION })).mutationApproved).toBe(true);
  });

  it('fails closed when workflow SHA and declared source revision diverge', () => {
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_SHA: 'b'.repeat(40) }))).toThrow('must equal the exact workflow GITHUB_SHA');
  });

  it('binds actor identity to immutable actor ID, never the mutable display name', () => {
    const first = buildLiveGcpProofPlan(env({ GITHUB_ACTOR: 'name-before' }));
    const renamed = buildLiveGcpProofPlan(env({ GITHUB_ACTOR: 'name-after' }));
    const differentId = buildLiveGcpProofPlan(env({ GITHUB_ACTOR_ID: '266194343' }));
    expect(first.actorHash).toBe(renamed.actorHash);
    expect(first.actorHash).not.toBe(differentId.actorHash);
    expect(JSON.stringify(first.operation)).not.toContain('name-before');
    expect(JSON.stringify(first.operation)).not.toContain('OuroborosCollective');
  });

  it('rejects malformed cloud and immutable execution identity before provider calls', () => {
    expect(() => buildLiveGcpProofPlan(env({ GCP_PROJECT_ID: 'BAD PROJECT' }))).toThrow('GCP_PROJECT_ID is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GCP_REGION: 'west' }))).toThrow('GCP_REGION is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_RUN_ID: 'run-1' }))).toThrow(/positive numeric identity/);
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_ACTOR_ID: 'owner-name' }))).toThrow(/positive numeric identity/);
  });
});
