import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CloudRunAdapter } from '../server/adapters/gcp/cloudrun';
import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence/canonicalJson';
import { buildLiveGcpProofPlan, type LiveGcpProofPlan } from '../server/gcp/liveProof';
import { FirestoreOperatorExecutor, createRealFirestoreEffectStore } from '../server/ops/firestoreEffect';

const RECEIPT_PATH = 'gcp-live-proof-receipt.json';
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
type ProofOutcome = 'OBSERVED' | 'BLOCKED_BY_MISSING_EVIDENCE' | 'CONTRADICTED';
interface ExecutionIdentity { githubRunId: string; githubRunAttempt: string; repositoryId: string; repositoryOwnerId: string; actorId: string; wifPrincipal: string; gcpProjectNumber: string }
interface LiveProofReceiptBody extends Record<string, unknown> {
  schemaVersion: 'prooffleet.gcp-live-proof.v2'; outcome: ProofOutcome; reason: string; sourceRevision: string; workflowRunId: string;
  actorHash: string; executionIdentity: ExecutionIdentity; projectId: string; region: string; cloudRunService: string;
  firestoreCollection: string; operationId: string; cloudRun: Record<string, unknown> | null; firestore: Record<string, unknown> | null; generatedAt: string;
}
function requirePositiveInteger(name: string, value: string | undefined): string { const n=String(value??'').trim(); if(!POSITIVE_INTEGER.test(n)) throw new Error(`${name} must be a positive decimal integer`); return n; }
function requireServiceAccount(value: string | undefined): string { const n=String(value??'').trim(); if(!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(n)) throw new Error('PROOFFLEET_WIF_PRINCIPAL must be an observed Google service-account principal'); return n; }
export function buildExecutionIdentity(env: NodeJS.ProcessEnv): ExecutionIdentity { return {
  githubRunId: requirePositiveInteger('PROOFFLEET_GITHUB_RUN_ID', env.PROOFFLEET_GITHUB_RUN_ID), githubRunAttempt: requirePositiveInteger('PROOFFLEET_GITHUB_RUN_ATTEMPT', env.PROOFFLEET_GITHUB_RUN_ATTEMPT),
  repositoryId: requirePositiveInteger('PROOFFLEET_GITHUB_REPOSITORY_ID', env.PROOFFLEET_GITHUB_REPOSITORY_ID), repositoryOwnerId: requirePositiveInteger('PROOFFLEET_GITHUB_REPOSITORY_OWNER_ID', env.PROOFFLEET_GITHUB_REPOSITORY_OWNER_ID),
  actorId: requirePositiveInteger('PROOFFLEET_GITHUB_ACTOR_ID', env.PROOFFLEET_GITHUB_ACTOR_ID), wifPrincipal: requireServiceAccount(env.PROOFFLEET_WIF_PRINCIPAL),
  gcpProjectNumber: requirePositiveInteger('PROOFFLEET_GCP_PROJECT_NUMBER', env.PROOFFLEET_GCP_PROJECT_NUMBER),
}; }
function nonSecretCloudEvidence(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function writeReceipt(body: LiveProofReceiptBody): void { const receiptHash=sha256Hex(canonicalJson(body)); writeFileSync(RECEIPT_PATH, `${JSON.stringify({...body,receiptHash},null,2)}\n`,'utf8'); }
async function runLiveProof(plan: LiveGcpProofPlan, executionIdentity: ExecutionIdentity): Promise<LiveProofReceiptBody> {
  if(plan.workflowRunId!==executionIdentity.githubRunId) throw new Error(`live-proof plan run ID ${plan.workflowRunId} does not match immutable GitHub run ID ${executionIdentity.githubRunId}`);
  const base={schemaVersion:'prooffleet.gcp-live-proof.v2' as const,sourceRevision:plan.sourceRevision,workflowRunId:plan.workflowRunId,actorHash:plan.actorHash,executionIdentity,projectId:plan.projectId,region:plan.region,cloudRunService:plan.serviceName,firestoreCollection:plan.collection,operationId:plan.operation.operationId,generatedAt:new Date().toISOString()};
  const cloudRun=new CloudRunAdapter({projectId:plan.projectId,region:plan.region,serviceName:plan.serviceName,sourceRevision:plan.sourceRevision});
  const cloudReadback=await cloudRun.readback(); const cloudEvidence=nonSecretCloudEvidence(cloudReadback.evidence);
  if(!cloudReadback.ok) return {...base,outcome:'BLOCKED_BY_MISSING_EVIDENCE',reason:`Cloud Run authoritative readback unavailable: ${cloudReadback.detail}`,cloudRun:null,firestore:null};
  if(cloudEvidence?.parserContract!=='prooffleet.cloudrun-readback.v2'||cloudEvidence?.sourceRevisionMatchesExpected!==true) return {...base,outcome:'BLOCKED_BY_MISSING_EVIDENCE',reason:'Cloud Run provider response did not satisfy the exact parser/source identity contract.',cloudRun:cloudEvidence,firestore:null};
  if(!plan.mutationApproved) return {...base,outcome:'BLOCKED_BY_MISSING_EVIDENCE',reason:'Explicit workflow-dispatch confirmation for the Firestore proof write is missing.',cloudRun:cloudEvidence,firestore:null};
  const store=await createRealFirestoreEffectStore({GCP_PROJECT_ID:plan.projectId,PROOFFLEET_FIRESTORE_COLLECTION:plan.collection,PROOFFLEET_SOURCE_REVISION:plan.sourceRevision});
  if(!store) return {...base,outcome:'BLOCKED_BY_MISSING_EVIDENCE',reason:'Real Firestore effect store could not be constructed from ADC/configuration.',cloudRun:cloudEvidence,firestore:null};
  const consent=new ConsentEngine(); const request=consent.createRequest(plan.operation,'HIGH','Explicit GitHub workflow_dispatch live-proof write.');
  const grant=consent.respond(request.requestId,'APPROVED',`github-actor-id:${executionIdentity.actorId}`,'Owner-triggered workflow supplied the exact live-proof confirmation phrase.'); if(!grant) throw new Error('explicit live-proof consent grant was not created');
  const executor=new FirestoreOperatorExecutor(store,plan.sourceRevision,consent); const result=await executor.execute(plan.operation,grant);
  const firestoreEvidence={status:result.status,sourceKind:result.sourceKind??null,sourceRevision:result.sourceRevision??null,readback:nonSecretCloudEvidence(result.readbackEvidence)};
  if((result.status==='applied'||result.status==='already_applied')&&result.sourceKind==='FIRESTORE_READBACK'&&result.sourceRevision===plan.sourceRevision) return {...base,outcome:'OBSERVED',reason:'Matching credential, Cloud Run source identity and operation-bound Firestore effect were authoritatively observed.',cloudRun:cloudEvidence,firestore:firestoreEvidence};
  return {...base,outcome:result.status==='failed'?'CONTRADICTED':'BLOCKED_BY_MISSING_EVIDENCE',reason:result.detail??'Firestore operation did not produce matching authoritative readback evidence.',cloudRun:cloudEvidence,firestore:firestoreEvidence};
}
async function main(): Promise<void> { const plan=buildLiveGcpProofPlan(process.env); const identity=buildExecutionIdentity(process.env); writeReceipt(await runLiveProof(plan,identity)); }
const invokedAsScript=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(invokedAsScript){main().catch((error)=>{process.stderr.write(`[gcp-live-proof] fatal: ${error instanceof Error?error.stack??error.message:String(error)}\n`);process.exit(1);});}
