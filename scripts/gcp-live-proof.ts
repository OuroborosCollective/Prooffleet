import { writeFileSync } from 'node:fs';

import { CloudRunAdapter } from '../server/adapters/gcp/cloudrun';
import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence/canonicalJson';
import {
  buildLiveGcpProofPlan,
  type LiveGcpProofPlan,
} from '../server/gcp/liveProof';
import {
  FirestoreOperatorExecutor,
  createRealFirestoreEffectStore,
} from '../server/ops/firestoreEffect';

const RECEIPT_PATH = 'gcp-live-proof-receipt.json';

type ProofOutcome = 'OBSERVED' | 'BLOCKED_BY_MISSING_EVIDENCE' | 'CONTRADICTED';

interface LiveProofReceiptBody extends Record<string, unknown> {
  schemaVersion: 'prooffleet.gcp-live-proof.v1';
  outcome: ProofOutcome;
  reason: string;
  sourceRevision: string;
  workflowRunId: string;
  actorHash: string;
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

async function runLiveProof(plan: LiveGcpProofPlan): Promise<LiveProofReceiptBody> {
  const base = {
    schemaVersion: 'prooffleet.gcp-live-proof.v1' as const,
    sourceRevision: plan.sourceRevision,
    workflowRunId: plan.workflowRunId,
    actorHash: plan.actorHash,
    projectId: plan.projectId,
    region: plan.region,
    cloudRunService: plan.serviceName,
    firestoreCollection: plan.collection,
    operationId: plan.operation.operationId,
    generatedAt: new Date().toISOString(),
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

  if (cloudEvidence?.sourceRevisionMatchesExpected !== true) {
    return {
      ...base,
      outcome: 'BLOCKED_BY_MISSING_EVIDENCE',
      reason: 'Cloud Run exists, but its declared PROOFFLEET_SOURCE_REVISION does not match this workflow source head.',
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
    `github-actor:${plan.actorHash.slice(0, 16)}`,
    'Owner-triggered workflow supplied the exact live-proof confirmation phrase.',
  );
  if (!grant) throw new Error('explicit live-proof consent grant was not created');

  const executor = new FirestoreOperatorExecutor(store, plan.sourceRevision, consent);
  const result = await executor.execute(plan.operation, grant);
  const readback = nonSecretCloudEvidence(result.readbackEvidence);
  const firestoreEvidence = {
    status: result.status,
    sourceKind: result.sourceKind ?? null,
    sourceRevision: result.sourceRevision ?? null,
    readback,
  };

  if (
    (result.status === 'applied' || result.status === 'already_applied') &&
    result.sourceKind === 'FIRESTORE_READBACK' &&
    result.sourceRevision === plan.sourceRevision
  ) {
    return {
      ...base,
      outcome: 'OBSERVED',
      reason: 'Matching Cloud Run source identity and operation-bound Firestore effect were both authoritatively observed.',
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
  const receipt = await runLiveProof(plan);
  writeReceipt(receipt);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[gcp-live-proof] fatal: ${message}\n`);
  process.exit(1);
});
