import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/;

function requireSha(label, value) {
  if (typeof value !== 'string' || !SHA40.test(value.trim())) {
    throw new Error(`${label} must be an exact lowercase 40-character Git SHA`);
  }
  return value.trim();
}

export function buildRevisionReceipt({
  eventName,
  githubSha,
  checkedOutSha,
  pullRequestHeadSha,
  pullRequestBaseSha,
}) {
  const testedCheckoutSha = requireSha('checkedOutSha', checkedOutSha);
  const workflowSha = requireSha('githubSha', githubSha);

  if (testedCheckoutSha !== workflowSha) {
    throw new Error(
      `checked-out revision ${testedCheckoutSha} does not match workflow GITHUB_SHA ${workflowSha}`,
    );
  }

  if (eventName === 'pull_request') {
    const sourceHeadSha = requireSha('pullRequestHeadSha', pullRequestHeadSha);
    const baseSha = requireSha('pullRequestBaseSha', pullRequestBaseSha);
    return {
      schemaVersion: 'prooffleet.ci-revision-receipt.v1',
      eventName,
      sourceHeadSha,
      baseSha,
      testedCheckoutSha,
      testedMergeSha: workflowSha,
    };
  }

  if (eventName === 'push') {
    return {
      schemaVersion: 'prooffleet.ci-revision-receipt.v1',
      eventName,
      sourceHeadSha: workflowSha,
      baseSha: null,
      testedCheckoutSha,
      testedMergeSha: null,
    };
  }

  throw new Error(`unsupported CI event: ${eventName}`);
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
    eventName: process.env.CI_EVENT_NAME,
    githubSha: process.env.GITHUB_SHA,
    checkedOutSha: currentCheckedOutSha(),
    pullRequestHeadSha: process.env.CI_PR_HEAD_SHA,
    pullRequestBaseSha: process.env.CI_PR_BASE_SHA,
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
