import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

function requireSha(label, value) {
  if (typeof value !== 'string' || !SHA40.test(value.trim())) {
    throw new Error(`${label} must be an exact lowercase 40-character Git SHA`);
  }
  return value.trim();
}

function requirePositiveInteger(label, value) {
  const normalized = String(value ?? '').trim();
  if (!POSITIVE_INTEGER.test(normalized)) {
    throw new Error(`${label} must be a positive decimal integer`);
  }
  return normalized;
}

function requireNonEmpty(label, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} must be non-empty`);
  return normalized;
}

function requireSha256(label, value) {
  const normalized = String(value ?? '').trim();
  if (!SHA256.test(normalized)) {
    throw new Error(`${label} must be an exact sha256 digest`);
  }
  return normalized;
}

export function sha256Text(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

/**
 * GitHub display names, labels and workflow paths are intentionally excluded
 * from authoritative identity. They may be useful context, but are mutable.
 */
export function buildRevisionReceipt(input) {
  const testedCheckoutSha = requireSha('checkedOutSha', input.checkedOutSha);
  const workflowSha = requireSha('githubSha', input.githubSha);
  if (testedCheckoutSha !== workflowSha) {
    throw new Error(`checked-out revision ${testedCheckoutSha} does not match workflow GITHUB_SHA ${workflowSha}`);
  }

  const run = {
    runId: requirePositiveInteger('runId', input.runId),
    runAttempt: requirePositiveInteger('runAttempt', input.runAttempt),
    repositoryId: requirePositiveInteger('repositoryId', input.repositoryId),
    repositoryOwnerId: requirePositiveInteger('repositoryOwnerId', input.repositoryOwnerId),
    actorId: requirePositiveInteger('actorId', input.actorId),
  };
  const runner = {
    environment: requireNonEmpty('runnerEnvironment', input.runnerEnvironment),
    os: requireNonEmpty('runnerOs', input.runnerOs),
    arch: requireNonEmpty('runnerArch', input.runnerArch),
  };
  const runtime = {
    containerImageId: requireSha256('containerImageId', input.containerImageId),
    healthReadbackSha256: requireSha256('healthReadbackSha256', input.healthReadbackSha256),
  };

  let sourceHeadSha;
  let baseSha;
  let testedMergeSha;
  if (input.eventName === 'pull_request') {
    sourceHeadSha = requireSha('pullRequestHeadSha', input.pullRequestHeadSha);
    baseSha = requireSha('pullRequestBaseSha', input.pullRequestBaseSha);
    testedMergeSha = workflowSha;
  } else if (input.eventName === 'push') {
    sourceHeadSha = workflowSha;
    baseSha = null;
    testedMergeSha = null;
  } else {
    throw new Error(`unsupported CI event: ${input.eventName}`);
  }

  const evidenceIdentity = {
    sourceHeadSha,
    baseSha,
    testedCheckoutSha,
    testedMergeSha,
    run,
    runner,
    runtime,
  };

  return {
    schemaVersion: 'prooffleet.ci-revision-receipt.v2',
    eventName: input.eventName,
    ...evidenceIdentity,
    evidenceIdentitySha256: sha256Text(JSON.stringify(evidenceIdentity)),
  };
}

function currentCheckedOutSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: process.cwd() });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git rev-parse HEAD failed with exit ${result.status}`);
  return result.stdout.trim();
}

function runCli() {
  const receipt = buildRevisionReceipt({
    eventName: process.env.CI_EVENT_NAME ?? '',
    githubSha: process.env.GITHUB_SHA ?? '',
    checkedOutSha: currentCheckedOutSha(),
    pullRequestHeadSha: process.env.CI_PR_HEAD_SHA,
    pullRequestBaseSha: process.env.CI_PR_BASE_SHA,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    repositoryId: process.env.GITHUB_REPOSITORY_ID,
    repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID,
    actorId: process.env.GITHUB_ACTOR_ID,
    runnerEnvironment: process.env.RUNNER_ENVIRONMENT,
    runnerOs: process.env.RUNNER_OS,
    runnerArch: process.env.RUNNER_ARCH,
    containerImageId: process.env.CI_CONTAINER_IMAGE_ID,
    healthReadbackSha256: process.env.CI_HEALTH_READBACK_SHA256,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  try { runCli(); }
  catch (error) {
    console.error(`[ci-revision-receipt] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
