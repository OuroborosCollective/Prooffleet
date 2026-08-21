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
  gcpProjectNumber: string;
  region: string;
  serviceName: string;
  collection: string;
  sourceRevision: string;
  executionIdentity: GithubExecutionIdentity;
  wifProvider: string;
  wifServiceAccount: string;
  observedWifPrincipal: string;
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

function parseWifProviderProjectNumber(value: string): string | null {
  return /^projects\/([1-9]\d*)\/locations\/global\/workloadIdentityPools\/[A-Za-z0-9._-]+\/providers\/[A-Za-z0-9._-]+$/.exec(value)?.[1] ?? null;
}

function validServiceAccount(value: string): boolean {
  return /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(value);
}

export function buildLiveGcpProofPlan(env: NodeJS.ProcessEnv): LiveGcpProofPlan {
  const projectId = required(env, 'GCP_PROJECT_ID');
  const gcpProjectNumber = required(env, 'PROOFFLEET_GCP_PROJECT_NUMBER');
  const region = required(env, 'GCP_REGION');
  const serviceName = required(env, 'PROOFFLEET_CLOUDRUN_SERVICE');
  const collection = required(env, 'PROOFFLEET_FIRESTORE_COLLECTION');
  const sourceRevision = requireExactGitRevision(required(env, 'PROOFFLEET_SOURCE_REVISION'));
  const wifProvider = required(env, 'GCP_WIF_PROVIDER');
  const wifServiceAccount = required(env, 'GCP_WIF_SERVICE_ACCOUNT');
  const observedWifPrincipal = required(env, 'PROOFFLEET_WIF_PRINCIPAL');
  const confirmation = env.PROOFFLEET_LIVE_CONFIRMATION ?? '';

  if (!validProjectId(projectId)) throw new Error('GCP_PROJECT_ID is malformed');
  if (!/^[1-9]\d*$/.test(gcpProjectNumber)) throw new Error('PROOFFLEET_GCP_PROJECT_NUMBER is malformed');
  if (!validRegion(region)) throw new Error('GCP_REGION is malformed');
  if (!validResourceLabel(serviceName)) throw new Error('PROOFFLEET_CLOUDRUN_SERVICE is malformed');
  if (!validResourceLabel(collection)) throw new Error('PROOFFLEET_FIRESTORE_COLLECTION is malformed');
  const providerProjectNumber = parseWifProviderProjectNumber(wifProvider);
  if (!providerProjectNumber) throw new Error('GCP_WIF_PROVIDER is malformed');
  if (providerProjectNumber !== gcpProjectNumber) {
    throw new Error('WIF provider project number does not match authenticated Google project readback');
  }
  if (!validServiceAccount(wifServiceAccount)) throw new Error('GCP_WIF_SERVICE_ACCOUNT is malformed');
  if (!validServiceAccount(observedWifPrincipal)) throw new Error('PROOFFLEET_WIF_PRINCIPAL is malformed');
  if (observedWifPrincipal !== wifServiceAccount) {
    throw new Error('authenticated WIF principal does not match configured WIF service account');
  }

  const executionIdentity = buildGithubExecutionIdentity(env, sourceRevision);
  const parameters = {
    proofKind: 'live_firestore_effect',
    sourceRevision,
    repositoryId: executionIdentity.repositoryId,
    workflowRunId: executionIdentity.workflowRunId,
    workflowRunAttempt: executionIdentity.workflowRunAttempt,
    executionIdentityHash: executionIdentity.identityHash,
    gcpProjectNumber,
    observedWifPrincipal,
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
    gcpProjectNumber,
    region,
    serviceName,
    collection,
    sourceRevision,
    executionIdentity,
    wifProvider,
    wifServiceAccount,
    observedWifPrincipal,
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
