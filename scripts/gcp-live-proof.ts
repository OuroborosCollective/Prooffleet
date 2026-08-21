import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CloudRunAdapter } from '../server/adapters/gcp/cloudrun';
import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence/canonicalJson';
import {
  bindExecutionToCredential,
  parseGoogleWifCredentialEvidence,
  type GoogleWifCredentialEvidence,
} from '../server/evidence/executionIdentity';
import { buildLiveGcpProofPlan, type LiveGcpProofPlan } from '../server/gcp/liveProof';
import {
  FirestoreOperatorExecutor,
  createRealFirestoreEffectStore,
} from '../server/ops/firestoreEffect';

const RECEIPT_PATH = 'gcp-live-proof-receipt.json';
type ProofOutcome = 'OBSERVED' | 'BLOCKED_BY_MISSING_EVIDENCE' | 'CONTRADICTED';

interface LiveProofReceiptBody extends Record<string, unknown> {
  schemaVersion: 'prooffleet.gcp-live-proof.v3';
  outcome: ProofOutcome;
  reason: string;
  sourceRevision: string;
  executionIdentity: LiveGcpProofPlan['executionIdentity'];
  credentialEvidence: GoogleWifCredentialEvidence | null;
  executionCredentialBindingHash: string | null;
  projectId: string;
  region: string;
  cloudRunService: string;
  firestoreCollection: string;
  operationId: string;
  cloudRun: Record<string, unknown> | null;
  firestore: Record<string, unknown> | null;
  generatedAt: string;
}

function nonSecretCloudEvidence(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function writeReceipt(body: LiveProofReceiptBody): void {
  const receiptHash = sha256Hex(canonicalJson(body));
  const receipt = { ...body, receiptHash };
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

function baseReceipt(plan: LiveGcpProofPlan): Omit<LiveProofReceiptBody, 'outcome' | 'reason' | 'cloudRun' | 'firestore'> {
  return {
    schemaVersion: 'prooffleet.gcp-live-proof.v3',
    sourceRevision: plan.sourceRevision,
    executionIdentity: plan.executionIdentity,
    credentialEvidence: null,
    executionCredentialBindingHash: null,
    projectId: plan.projectId,
    region: plan.region,
    cloudRunService: plan.serviceName,
    firestoreCollection: plan.collection,
    operationId: plan.operation.operationId,
    generatedAt: new Date().toISOString(),
  };
}

function readCredentialEvidence(plan: LiveGcpProofPlan): GoogleWifCredentialEvidence {
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credentialPath) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is missing after WIF authentication');
  }
  const rawCredentialJson = readFileSync(credentialPath, 'utf8');
  return parseGoogleWifCredentialEvidence(
    rawCredentialJson,
    plan.wifProvider,
    plan.wifServiceAccount,
  );
}

async function runLiveProof(
  plan: LiveGcpProofPlan,
  credentialEvidence: GoogleWifCredentialEvidence,
): Promise<LiveProofReceiptBody> {
  const executionCredentialBindingHash = bindExecutionToCredential(
    plan.executionIdentity,
    credentialEvidence,
  );
  const base = {
    ...baseReceipt(plan),
    credentialEvidence,
    executionCredentialBindingHash,
  };

  const cloudRun = new CloudRunAdapter({
    projectId: plan.projectId,
    region: plan.region,
    serviceName: plan.serviceName,
    sourceRevision: plan.sourceRevision,
  });
  const cloudReadback = await cloudRun.readback();
  const cloudEvidence = nonSecretCloudEvidence(cloudReadback.evidence);

  if (!cloudReadback.ok) {
    return {
      ...base,
      outcome: 'BLOCKED_BY_MISSING_EVIDENCE',
      reason: `Cloud Run authoritative readback unavailable: ${cloudReadback.detail}`,
      cloudRun: null,
      firestore: null,
    };
  }

  if (
    cloudEvidence?.parserContract !== 'prooffleet.cloudrun-readback.v2' ||
    cloudEvidence?.sourceRevisionMatchesExpected !== true
  ) {
    return {
      ...base,
      outcome: 'BLOCKED_BY_MISSING_EVIDENCE',
      reason: 'Cloud Run provider response did not satisfy the exact parser/source identity contract.',
      cloudRun: cloudEvidence,
      firestore: null,
    };
  }

  if (!plan.mutationApproved) {
    return {
      ...base,
      outcome: 'BLOCKED_BY_MISSING_EVIDENCE',
      reason: 'Explicit workflow-dispatch confirmation for the Firestore proof write is missing.',
      cloudRun: cloudEvidence,
      firestore: null,
    };
  }

  const store = await createRealFirestoreEffectStore({
    GCP_PROJECT_ID: plan.projectId,
    PROOFFLEET_FIRESTORE_COLLECTION: plan.collection,
    PROOFFLEET_SOURCE_REVISION: plan.sourceRevision,
  });
  if (!store) {
    return {
      ...base,
      outcome: 'BLOCKED_BY_MISSING_EVIDENCE',
      reason: 'Real Firestore effect store could not be constructed from ADC/configuration.',
      cloudRun: cloudEvidence,
      firestore: null,
    };
  }

  const consent = new ConsentEngine();
  const request = consent.createRequest(
    plan.operation,
    'HIGH',
    'Explicit GitHub workflow_dispatch live-proof write.',
  );
  const grant = consent.respond(
    request.requestId,
    'APPROVED',
    `github-execution:${plan.executionIdentity.identityHash.slice(0, 24)}`,
    'Owner-triggered workflow supplied the exact live-proof confirmation phrase.',
  );
  if (!grant) throw new Error('explicit live-proof consent grant was not created');

  const executor = new FirestoreOperatorExecutor(store, plan.sourceRevision, consent);
  const result = await executor.execute(plan.operation, grant);
  const firestoreEvidence = {
    status: result.status,
    sourceKind: result.sourceKind ?? null,
    sourceRevision: result.sourceRevision ?? null,
    readback: nonSecretCloudEvidence(result.readbackEvidence),
  };

  if (
    (result.status === 'applied' || result.status === 'already_applied') &&
    result.sourceKind === 'FIRESTORE_READBACK' &&
    result.sourceRevision === plan.sourceRevision
  ) {
    return {
      ...base,
      outcome: 'OBSERVED',
      reason: 'Matching run-scoped WIF credential configuration, Cloud Run source identity and operation-bound Firestore effect were authoritatively observed.',
      cloudRun: cloudEvidence,
      firestore: firestoreEvidence,
    };
  }

  return {
    ...base,
    outcome: result.status === 'failed' ? 'CONTRADICTED' : 'BLOCKED_BY_MISSING_EVIDENCE',
    reason: result.detail ?? 'Firestore operation did not produce matching authoritative readback evidence.',
    cloudRun: cloudEvidence,
    firestore: firestoreEvidence,
  };
}

async function main(): Promise<void> {
  const plan = buildLiveGcpProofPlan(process.env);
  let credentialEvidence: GoogleWifCredentialEvidence;
  try {
    credentialEvidence = readCredentialEvidence(plan);
  } catch (error) {
    writeReceipt({
      ...baseReceipt(plan),
      outcome: 'BLOCKED_BY_MISSING_EVIDENCE',
      reason: `WIF credential evidence rejected fail-closed: ${error instanceof Error ? error.message : String(error)}`,
      cloudRun: null,
      firestore: null,
    });
    return;
  }

  writeReceipt(await runLiveProof(plan, credentialEvidence));
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`[gcp-live-proof] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
}
