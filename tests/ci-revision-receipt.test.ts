import { describe, expect, it } from 'vitest';
import { buildRevisionReceipt } from '../scripts/ci-revision-receipt.mjs';

const SOURCE = '1'.repeat(40);
const BASE = '2'.repeat(40);
const MERGE = '3'.repeat(40);
const IMAGE = `sha256:${'4'.repeat(64)}`;
const HEALTH = `sha256:${'5'.repeat(64)}`;
const identity = {
  runId: '32517685281', runAttempt: '1', repositoryId: '1339097875',
  repositoryOwnerId: '266194342', actorId: '266194342',
  runnerEnvironment: 'github-hosted', runnerOs: 'Linux', runnerArch: 'X64',
  containerImageId: IMAGE, healthReadbackSha256: HEALTH,
};

describe('CI revision receipt v2', () => {
  it('binds source, tested merge, immutable IDs, runner and runtime readback', () => {
    const receipt = buildRevisionReceipt({ ...identity, eventName: 'pull_request', githubSha: MERGE,
      checkedOutSha: MERGE, pullRequestHeadSha: SOURCE, pullRequestBaseSha: BASE });
    expect(receipt.schemaVersion).toBe('prooffleet.ci-revision-receipt.v2');
    expect(receipt.sourceHeadSha).toBe(SOURCE);
    expect(receipt.testedMergeSha).toBe(MERGE);
    expect(receipt.run.repositoryId).toBe(identity.repositoryId);
    expect(receipt.run.repositoryOwnerId).toBe(identity.repositoryOwnerId);
    expect(receipt.run.actorId).toBe(identity.actorId);
    expect(receipt.runner).toEqual({ environment: 'github-hosted', os: 'Linux', arch: 'X64' });
    expect(receipt.runtime).toEqual({ containerImageId: IMAGE, healthReadbackSha256: HEALTH });
    expect(receipt.evidenceIdentitySha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('records push verification as the source head directly', () => {
    const receipt = buildRevisionReceipt({ ...identity, eventName: 'push', githubSha: SOURCE, checkedOutSha: SOURCE });
    expect(receipt.sourceHeadSha).toBe(SOURCE);
    expect(receipt.testedMergeSha).toBeNull();
    expect(receipt.baseSha).toBeNull();
  });

  it('rejects checkout mismatch', () => {
    expect(() => buildRevisionReceipt({ ...identity, eventName: 'pull_request', githubSha: MERGE,
      checkedOutSha: SOURCE, pullRequestHeadSha: SOURCE, pullRequestBaseSha: BASE })).toThrow(/does not match/);
  });

  it('rejects mutable descriptors where numeric identities are required', () => {
    expect(() => buildRevisionReceipt({ ...identity, repositoryId: 'repo-name', eventName: 'push', githubSha: SOURCE, checkedOutSha: SOURCE })).toThrow(/positive decimal integer/);
    expect(() => buildRevisionReceipt({ ...identity, actorId: 'actor-name', eventName: 'push', githubSha: SOURCE, checkedOutSha: SOURCE })).toThrow(/positive decimal integer/);
  });

  it('rejects malformed runtime hashes', () => {
    expect(() => buildRevisionReceipt({ ...identity, containerImageId: 'latest', eventName: 'push', githubSha: SOURCE, checkedOutSha: SOURCE })).toThrow(/exact sha256 digest/);
    expect(() => buildRevisionReceipt({ ...identity, healthReadbackSha256: 'healthy', eventName: 'push', githubSha: SOURCE, checkedOutSha: SOURCE })).toThrow(/exact sha256 digest/);
  });

  it('changes evidence identity when run or runtime evidence changes', () => {
    const a = buildRevisionReceipt({ ...identity, eventName: 'push', githubSha: SOURCE, checkedOutSha: SOURCE });
    const b = buildRevisionReceipt({ ...identity, runAttempt: '2', eventName: 'push', githubSha: SOURCE, checkedOutSha: SOURCE });
    expect(a.evidenceIdentitySha256).not.toBe(b.evidenceIdentitySha256);
  });

  it('rejects unsupported event families', () => {
    expect(() => buildRevisionReceipt({ ...identity, eventName: 'workflow_dispatch', githubSha: SOURCE, checkedOutSha: SOURCE })).toThrow(/unsupported CI event/);
  });
});
