import { canonicalJson, sha256Hex } from '../evidence/canonicalJson';
import { requireExactGitRevision } from '../revisionIdentity';
import type { OperationSpec } from '../../src/types/index';

export const LIVE_GCP_CONFIRMATION = 'I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE';

export interface LiveGcpProofPlan {
  projectId: string;
  region: string;
  serviceName: string;
  collection: string;
  sourceRevision: string;
  githubRepositoryId: string;
  workflowRunId: string;
  workflowRunAttempt: string;
  githubActorIdHash: string;
  runnerNameHash: string;
  runnerOs: string;
  runnerArch: string;
  executionContextHash: string;
  mutationApproved: boolean;
  operation: OperationSpec;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function requiredNumeric(env: NodeJS.ProcessEnv, key: string): string {
  const value = required(env, key);
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${key} must be a positive numeric identity`);
  return value;
}

function validProjectId(value: string): boolean {
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value);
}

function validRegion(value: string): boolean {
  return /^[a-z]+-[a-z0-9]+\d$/.test(value);
}

function validResourceLabel(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(value);
}

export function buildLiveGcpProofPlan(env: NodeJS.ProcessEnv): LiveGcpProofPlan {
  const projectId = required(env, 'GCP_PROJECT_ID');
  const region = required(env, 'GCP_REGION');
  const serviceName = required(env, 'PROOFFLEET_CLOUDRUN_SERVICE');
  const collection = required(env, 'PROOFFLEET_FIRESTORE_COLLECTION');
  const sourceRevision = requireExactGitRevision(required(env, 'PROOFFLEET_SOURCE_REVISION'));
  const githubSha = requireExactGitRevision(required(env, 'GITHUB_SHA'));
  const githubRepositoryId = requiredNumeric(env, 'GITHUB_REPOSITORY_ID');
  const workflowRunId = requiredNumeric(env, 'GITHUB_RUN_ID');
  const workflowRunAttempt = requiredNumeric(env, 'GITHUB_RUN_ATTEMPT');
  const githubActorId = requiredNumeric(env, 'GITHUB_ACTOR_ID');
  const runnerName = required(env, 'RUNNER_NAME');
  const runnerOs = required(env, 'RUNNER_OS');
  const runnerArch = required(env, 'RUNNER_ARCH');
  const confirmation = env.PROOFFLEET_LIVE_CONFIRMATION ?? '';

  if (!validProjectId(projectId)) throw new Error('GCP_PROJECT_ID is malformed');
  if (!validRegion(region)) throw new Error('GCP_REGION is malformed');
  if (!validResourceLabel(serviceName)) throw new Error('PROOFFLEET_CLOUDRUN_SERVICE is malformed');
  if (!validResourceLabel(collection)) throw new Error('PROOFFLEET_FIRESTORE_COLLECTION is malformed');
  if (sourceRevision !== githubSha) {
    throw new Error('PROOFFLEET_SOURCE_REVISION must equal the exact workflow GITHUB_SHA');
  }

  const githubActorIdHash = sha256Hex(githubActorId);
  const runnerNameHash = sha256Hex(runnerName);
  const executionContextHash = sha256Hex(canonicalJson({
    sourceRevision,
    githubRepositoryId,
    workflowRunId,
    workflowRunAttempt,
    githubActorIdHash,
    runnerNameHash,
    runnerOs,
    runnerArch,
  }));

  // Operation identity intentionally remains stable across a retry attempt of
  // the same GitHub run. Attempt/runner identity is sealed into the receipt via
  // executionContextHash, while the durable mutation uses one idempotency key.
  const parameters = {
    proofKind: 'live_firestore_effect',
    sourceRevision,
    githubRepositoryId,
    workflowRunId,
    githubActorIdHash,
  };
  const parametersHash = sha256Hex(canonicalJson(parameters));
  const missionId = `gcp-live-${workflowRunId}`;
  const actionName = 'record_live_gcp_proof';
  const targetResource = `firestore:${collection}`;
  const operationId = `gcp-${sha256Hex(
    canonicalJson({
      missionId,
      actionName,
      targetResource,
      parametersHash,
    }),
  ).slice(0, 24)}`;

  return {
    projectId,
    region,
    serviceName,
    collection,
    sourceRevision,
    githubRepositoryId,
    workflowRunId,
    workflowRunAttempt,
    githubActorIdHash,
    runnerNameHash,
    runnerOs,
    runnerArch,
    executionContextHash,
    mutationApproved: confirmation === LIVE_GCP_CONFIRMATION,
    operation: {
      operationId,
      kind: 'write',
      actionName,
      targetResource,
      parameters,
      parametersHash,
      missionId,
      missionRevision: 1,
    },
  };
}
