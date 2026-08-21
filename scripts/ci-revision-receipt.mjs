import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildGitHubExecutionIdentity,
  requireExactSha,
  sealReceipt,
} from './authority-evidence.mjs';

/**
 * @param {{
 *   eventName: string,
 *   githubSha: string,
 *   checkedOutSha: string,
 *   pullRequestHeadSha?: string,
 *   pullRequestBaseSha?: string,
 *   githubEnvironment: NodeJS.ProcessEnv,
 *   expectedRepositoryId?: string,
 *   expectedOwnerId?: string,
 * }} input
 */
export function buildRevisionReceipt({
  eventName,
  githubSha,
  checkedOutSha,
  pullRequestHeadSha,
  pullRequestBaseSha,
  githubEnvironment,
  expectedRepositoryId,
  expectedOwnerId,
}) {
  const testedCheckoutSha = requireExactSha('checkedOutSha', checkedOutSha);
  const workflowSha = requireExactSha('githubSha', githubSha);

  if (testedCheckoutSha !== workflowSha) {
    throw new Error(
      `checked-out revision ${testedCheckoutSha} does not match workflow GITHUB_SHA ${workflowSha}`,
    );
  }

  let sourceHeadSha;
  let baseSha;
  let testedMergeSha;

  if (eventName === 'pull_request') {
    sourceHeadSha = requireExactSha('pullRequestHeadSha', pullRequestHeadSha);
    baseSha = requireExactSha('pullRequestBaseSha', pullRequestBaseSha);
    testedMergeSha = workflowSha;
  } else if (eventName === 'push') {
    sourceHeadSha = workflowSha;
    baseSha = null;
    testedMergeSha = null;
  } else {
    throw new Error(`unsupported CI event: ${eventName}`);
  }

  const githubExecution = buildGitHubExecutionIdentity(githubEnvironment, {
    sourceRevision: testedCheckoutSha,
    expectedRepositoryId,
    expectedOwnerId,
  });

  return sealReceipt({
    schemaVersion: 'prooffleet.ci-revision-receipt.v2',
    eventName,
    sourceHeadSha,
    baseSha,
    testedCheckoutSha,
    testedMergeSha,
    githubExecution,
  });
}

function currentCheckedOutSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git rev-parse HEAD failed with exit ${result.status}`);
  }
  return result.stdout.trim();
}

function runCli() {
  const receipt = buildRevisionReceipt({
    eventName: process.env.CI_EVENT_NAME ?? '',
    githubSha: process.env.GITHUB_SHA ?? '',
    checkedOutSha: currentCheckedOutSha(),
    pullRequestHeadSha: process.env.CI_PR_HEAD_SHA,
    pullRequestBaseSha: process.env.CI_PR_BASE_SHA,
    githubEnvironment: process.env,
    expectedRepositoryId: process.env.CI_EXPECTED_REPOSITORY_ID,
    expectedOwnerId: process.env.CI_EXPECTED_OWNER_ID,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const invokedAsScript =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedAsScript) {
  try {
    runCli();
  } catch (error) {
    console.error(
      `[ci-revision-receipt] FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
