import { canonicalJson, sha256Hex } from '../evidence/canonicalJson';
import {
  buildGithubExecutionIdentity,
  type GithubExecutionIdentity,
} from '../evidence/executionIdentity';
import { requireExactGitRevision } from '../revisionIdentity';
import type { OperationSpec } from '../../src/types/index';

export const LIVE_GCP_CONFIRMATION = 'I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE';

export interface LiveGcpProofPlan {
  projectId: string;
  region: string;
  serviceName: string;
  collection: string;
  sourceRevision: string;
  executionIdentity: GithubExecutionIdentity;
  wifProvider: string;
  wifServiceAccount: string;
  mutationApproved: boolean;
  operation: OperationSpec;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
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

function validWifProvider(value: string): boolean {
  return /^projects\/[1-9]\d*\/locations\/global\/workloadIdentityPools\/[A-Za-z0-9._-]+\/providers\/[A-Za-z0-9._-]+$/.test(value);
}

function validServiceAccount(value: string): boolean {
  return /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(value);
}

export function buildLiveGcpProofPlan(env: NodeJS.ProcessEnv): LiveGcpProofPlan {
  const projectId = required(env, 'GCP_PROJECT_ID');
  const region = required(env, 'GCP_REGION');
  const serviceName = required(env, 'PROOFFLEET_CLOUDRUN_SERVICE');
  const collection = required(env, 'PROOFFLEET_FIRESTORE_COLLECTION');
  const sourceRevision = requireExactGitRevision(required(env, 'PROOFFLEET_SOURCE_REVISION'));
  const wifProvider = required(env, 'GCP_WIF_PROVIDER');
  const wifServiceAccount = required(env, 'GCP_WIF_SERVICE_ACCOUNT');
  const confirmation = env.PROOFFLEET_LIVE_CONFIRMATION ?? '';

  if (!validProjectId(projectId)) throw new Error('GCP_PROJECT_ID is malformed');
  if (!validRegion(region)) throw new Error('GCP_REGION is malformed');
  if (!validResourceLabel(serviceName)) throw new Error('PROOFFLEET_CLOUDRUN_SERVICE is malformed');
  if (!validResourceLabel(collection)) throw new Error('PROOFFLEET_FIRESTORE_COLLECTION is malformed');
  if (!validWifProvider(wifProvider)) throw new Error('GCP_WIF_PROVIDER is malformed');
  if (!validServiceAccount(wifServiceAccount)) throw new Error('GCP_WIF_SERVICE_ACCOUNT is malformed');

  const executionIdentity = buildGithubExecutionIdentity(env, sourceRevision);
  const parameters = {
    proofKind: 'live_firestore_effect',
    sourceRevision,
    repositoryId: executionIdentity.repositoryId,
    workflowRunId: executionIdentity.workflowRunId,
    workflowRunAttempt: executionIdentity.workflowRunAttempt,
    executionIdentityHash: executionIdentity.identityHash,
  };
  const parametersHash = sha256Hex(canonicalJson(parameters));
  const missionId = `gcp-live-${executionIdentity.workflowRunId}-${executionIdentity.workflowRunAttempt}`;
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
    executionIdentity,
    wifProvider,
    wifServiceAccount,
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
