import { describe, expect, it } from 'vitest';

import { buildRevisionReceipt } from '../scripts/ci-revision-receipt.mjs';

const SOURCE = '1'.repeat(40);
const BASE = '2'.repeat(40);
const MERGE = '3'.repeat(40);

describe('CI revision receipt', () => {
  it('keeps pull-request source head distinct from tested synthetic merge SHA', () => {
    const receipt = buildRevisionReceipt({
      eventName: 'pull_request',
      githubSha: MERGE,
      checkedOutSha: MERGE,
      pullRequestHeadSha: SOURCE,
      pullRequestBaseSha: BASE,
    });

    expect(receipt).toEqual({
      schemaVersion: 'prooffleet.ci-revision-receipt.v1',
      eventName: 'pull_request',
      sourceHeadSha: SOURCE,
      baseSha: BASE,
      testedCheckoutSha: MERGE,
      testedMergeSha: MERGE,
    });
    expect(receipt.sourceHeadSha).not.toBe(receipt.testedMergeSha);
  });

  it('records push verification as testing the source head directly', () => {
    const receipt = buildRevisionReceipt({
      eventName: 'push',
      githubSha: SOURCE,
      checkedOutSha: SOURCE,
    });

    expect(receipt.sourceHeadSha).toBe(SOURCE);
    expect(receipt.testedCheckoutSha).toBe(SOURCE);
    expect(receipt.testedMergeSha).toBeNull();
    expect(receipt.baseSha).toBeNull();
  });

  it('fails if checkout identity does not match workflow GITHUB_SHA', () => {
    expect(() =>
      buildRevisionReceipt({
        eventName: 'pull_request',
        githubSha: MERGE,
        checkedOutSha: SOURCE,
        pullRequestHeadSha: SOURCE,
        pullRequestBaseSha: BASE,
      }),
    ).toThrow(/does not match workflow GITHUB_SHA/);
  });

  it('fails closed on malformed revision identities', () => {
    expect(() =>
      buildRevisionReceipt({
        eventName: 'pull_request',
        githubSha: MERGE,
        checkedOutSha: MERGE,
        pullRequestHeadSha: 'not-a-sha',
        pullRequestBaseSha: BASE,
      }),
    ).toThrow(/exact lowercase 40-character Git SHA/);
  });

  it('rejects unsupported event families instead of guessing semantics', () => {
    expect(() =>
      buildRevisionReceipt({
        eventName: 'workflow_dispatch',
        githubSha: SOURCE,
        checkedOutSha: SOURCE,
      }),
    ).toThrow(/unsupported CI event/);
  });
});
