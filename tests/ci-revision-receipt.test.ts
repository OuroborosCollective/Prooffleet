import { describe, expect, it } from 'vitest';

import { buildRevisionReceipt } from '../scripts/ci-revision-receipt.mjs';

const SOURCE = '1'.repeat(40);
const BASE = '2'.repeat(40);
const MERGE = '3'.repeat(40);

function githubEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_REPOSITORY_ID: '1339097875',
    GITHUB_REPOSITORY_OWNER_ID: '266194342',
    GITHUB_ACTOR_ID: '266194342',
    GITHUB_RUN_ID: '32517685281',
    GITHUB_RUN_ATTEMPT: '1',
    RUNNER_NAME: 'GitHub Actions 1000999999',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    ...overrides,
  };
}

describe('CI revision receipt', () => {
  it('keeps pull-request source head distinct from tested synthetic merge SHA and binds the run identity', () => {
    const receipt = buildRevisionReceipt({
      eventName: 'pull_request',
      githubSha: MERGE,
      checkedOutSha: MERGE,
      pullRequestHeadSha: SOURCE,
      pullRequestBaseSha: BASE,
      githubEnvironment: githubEnvironment(),
      expectedRepositoryId: '1339097875',
      expectedOwnerId: '266194342',
    });

    expect(receipt).toMatchObject({
      schemaVersion: 'prooffleet.ci-revision-receipt.v2',
      eventName: 'pull_request',
      sourceHeadSha: SOURCE,
      baseSha: BASE,
      testedCheckoutSha: MERGE,
      testedMergeSha: MERGE,
      githubExecution: {
        schemaVersion: 'prooffleet.github-execution-identity.v1',
        sourceRevision: MERGE,
        repositoryId: '1339097875',
        repositoryOwnerId: '266194342',
        actorId: '266194342',
        runId: '32517685281',
        runAttempt: '1',
      },
    });
    expect(receipt.sourceHeadSha).not.toBe(receipt.testedMergeSha);
    expect(receipt.githubExecution.identityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records push verification as testing the source head directly', () => {
    const receipt = buildRevisionReceipt({
      eventName: 'push',
      githubSha: SOURCE,
      checkedOutSha: SOURCE,
      githubEnvironment: githubEnvironment(),
    });

    expect(receipt.sourceHeadSha).toBe(SOURCE);
    expect(receipt.testedCheckoutSha).toBe(SOURCE);
    expect(receipt.testedMergeSha).toBeNull();
    expect(receipt.baseSha).toBeNull();
    expect(receipt.githubExecution.sourceRevision).toBe(SOURCE);
  });

  it('ignores mutable actor and workflow names when immutable GitHub identities are unchanged', () => {
    const first = buildRevisionReceipt({
      eventName: 'push',
      githubSha: SOURCE,
      checkedOutSha: SOURCE,
      githubEnvironment: githubEnvironment({
        GITHUB_ACTOR: 'old-name',
        GITHUB_WORKFLOW: 'Old Workflow Path',
      }),
    });
    const second = buildRevisionReceipt({
      eventName: 'push',
      githubSha: SOURCE,
      checkedOutSha: SOURCE,
      githubEnvironment: githubEnvironment({
        GITHUB_ACTOR: 'renamed-user',
        GITHUB_WORKFLOW: 'Moved Workflow Path',
      }),
    });

    expect(first.githubExecution.identityHash).toBe(second.githubExecution.identityHash);
    expect(first.receiptHash).toBe(second.receiptHash);
  });

  it('fails if checkout identity does not match workflow GITHUB_SHA', () => {
    expect(() =>
      buildRevisionReceipt({
        eventName: 'pull_request',
        githubSha: MERGE,
        checkedOutSha: SOURCE,
        pullRequestHeadSha: SOURCE,
        pullRequestBaseSha: BASE,
        githubEnvironment: githubEnvironment(),
      }),
    ).toThrow(/does not match workflow GITHUB_SHA/);
  });

  it('fails closed on malformed revision or immutable GitHub identities', () => {
    expect(() =>
      buildRevisionReceipt({
        eventName: 'pull_request',
        githubSha: MERGE,
        checkedOutSha: MERGE,
        pullRequestHeadSha: 'not-a-sha',
        pullRequestBaseSha: BASE,
        githubEnvironment: githubEnvironment(),
      }),
    ).toThrow(/exact lowercase 40-character Git SHA/);

    expect(() =>
      buildRevisionReceipt({
        eventName: 'push',
        githubSha: SOURCE,
        checkedOutSha: SOURCE,
        githubEnvironment: githubEnvironment({ GITHUB_REPOSITORY_ID: 'repo-name' }),
      }),
    ).toThrow(/positive numeric identity/);
  });

  it('rejects immutable repository-owner mismatches instead of trusting display names', () => {
    expect(() => buildRevisionReceipt({
      eventName: 'push',
      githubSha: SOURCE,
      checkedOutSha: SOURCE,
      githubEnvironment: githubEnvironment(),
      expectedRepositoryId: '1339097875',
      expectedOwnerId: '999',
    })).toThrow(/repository owner identity mismatch/);
  });

  it('rejects unsupported event families instead of guessing semantics', () => {
    expect(() =>
      buildRevisionReceipt({
        eventName: 'workflow_dispatch',
        githubSha: SOURCE,
        checkedOutSha: SOURCE,
        githubEnvironment: githubEnvironment(),
      }),
    ).toThrow(/unsupported CI event/);
  });
});
