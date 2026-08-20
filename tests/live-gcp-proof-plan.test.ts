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
    GITHUB_RUN_ID: '12345',
    GITHUB_ACTOR: 'owner-user',
    PROOFFLEET_LIVE_CONFIRMATION: '',
    ...overrides,
  };
}

describe('Live GCP proof plan', () => {
  it('binds operation identity to exact workflow source revision', () => {
    const first = buildLiveGcpProofPlan(env());
    const second = buildLiveGcpProofPlan(env({
      PROOFFLEET_SOURCE_REVISION: 'b'.repeat(40),
      GITHUB_SHA: 'b'.repeat(40),
    }));

    expect(first.operation.parameters.sourceRevision).toBe(SHA);
    expect(first.operation.operationId).not.toBe(second.operation.operationId);
    expect(first.operation.targetResource).toBe('firestore:proof-effects');
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

  it('stores only a hash of the GitHub actor in the operation identity', () => {
    const plan = buildLiveGcpProofPlan(env());
    expect(plan.actorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(plan.operation)).not.toContain('owner-user');
  });

  it('rejects malformed cloud configuration before any provider call', () => {
    expect(() => buildLiveGcpProofPlan(env({ GCP_PROJECT_ID: 'BAD PROJECT' })))
      .toThrow('GCP_PROJECT_ID is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GCP_REGION: 'west' })))
      .toThrow('GCP_REGION is malformed');
    expect(() => buildLiveGcpProofPlan(env({ GITHUB_RUN_ID: 'run-1' })))
      .toThrow('GITHUB_RUN_ID must be numeric');
  });
});
