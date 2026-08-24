import { describe, expect, it } from "vitest";

import { ConsentEngine } from "../server/consent/consentEngine";
import { buildLiveGcpProofPlan } from "../server/gcp/liveProof";
import {
  FirestoreOperatorExecutor,
  type FirestoreEffectIdentity,
  type FirestoreEffectSnapshot,
  type FirestoreEffectStore,
} from "../server/ops/firestoreEffect";
import type { OperationSpec } from "../src/types";

const SOURCE = "a".repeat(40);
const PROJECT_NUMBER = "123456789012";
const WIF_PROVIDER = `projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo`;
const WIF_SERVICE_ACCOUNT = "prooffleet-github@prooffleet-test1.iam.gserviceaccount.com";

class SharedFirestoreStore implements FirestoreEffectStore {
  readonly projectId = "prooffleet-test1";
  readonly collection = "proof-effects";
  private readonly docs = new Map<string, FirestoreEffectIdentity>();
  createCalls = 0;

  async get(documentId: string): Promise<FirestoreEffectSnapshot> {
    const data = this.docs.get(documentId);
    return data ? { exists: true, data: structuredClone(data) } : { exists: false };
  }

  async create(documentId: string, data: FirestoreEffectIdentity): Promise<void> {
    this.createCalls += 1;
    if (this.docs.has(documentId)) throw new Error("ALREADY_EXISTS");
    this.docs.set(documentId, structuredClone(data));
  }
}

function planEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GCP_PROJECT_ID: "prooffleet-test1",
    PROOFFLEET_GCP_PROJECT_NUMBER: PROJECT_NUMBER,
    GCP_REGION: "europe-west1",
    GCP_WIF_PROVIDER: WIF_PROVIDER,
    GCP_WIF_SERVICE_ACCOUNT: WIF_SERVICE_ACCOUNT,
    PROOFFLEET_WIF_PRINCIPAL: WIF_SERVICE_ACCOUNT,
    PROOFFLEET_CLOUDRUN_SERVICE: "prooffleet",
    PROOFFLEET_FIRESTORE_COLLECTION: "proof-effects",
    PROOFFLEET_SOURCE_REVISION: SOURCE,
    GITHUB_SHA: SOURCE,
    GITHUB_REPOSITORY_ID: "1339097875",
    GITHUB_REPOSITORY_OWNER_ID: "266194342",
    GITHUB_ACTOR_ID: "266194342",
    GITHUB_RUN_ID: "12345",
    GITHUB_RUN_ATTEMPT: "1",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Linux",
    RUNNER_ARCH: "X64",
    RUNNER_NAME: "GitHub Actions 100",
    PROOFFLEET_LIVE_CONFIRMATION: "I_APPROVE_PROOFFLEET_FIRESTORE_PROOF_WRITE",
    ...overrides,
  };
}

function grantFor(operation: OperationSpec) {
  const consent = new ConsentEngine();
  const request = consent.createRequest(operation, "HIGH", "semantic replay regression");
  const grant = consent.respond(request.requestId, "APPROVED", "owner", "exact operation approved");
  if (!grant) throw new Error("expected consent grant");
  return grant;
}

describe("Live GCP Firestore semantic replay boundary", () => {
  it("blocks a fresh workflow-run replay from creating a second real-effect document", async () => {
    const first = buildLiveGcpProofPlan(planEnv());
    const redelivery = buildLiveGcpProofPlan(planEnv({ GITHUB_RUN_ID: "67890", GITHUB_RUN_ATTEMPT: "1" }));
    const store = new SharedFirestoreStore();

    expect(first.executionIdentity.identityHash).not.toBe(redelivery.executionIdentity.identityHash);
    expect(first.operation.operationId).toBe(redelivery.operation.operationId);
    expect(first.operation.parametersHash).toBe(redelivery.operation.parametersHash);

    const firstResult = await new FirestoreOperatorExecutor(store, SOURCE)
      .execute(first.operation, grantFor(first.operation));
    const redeliveryResult = await new FirestoreOperatorExecutor(store, SOURCE)
      .execute(redelivery.operation, grantFor(redelivery.operation));

    expect(firstResult.status).toBe("applied");
    expect(redeliveryResult.status).toBe("already_applied");
    expect(redeliveryResult.sourceKind).toBe("FIRESTORE_READBACK");
    expect(store.createCalls).toBe(1);
  });

  it("does not collapse a different source revision or target into the replay-safe effect", () => {
    const first = buildLiveGcpProofPlan(planEnv());
    const sourceChanged = buildLiveGcpProofPlan(planEnv({
      PROOFFLEET_SOURCE_REVISION: "b".repeat(40),
      GITHUB_SHA: "b".repeat(40),
    }));
    const targetChanged = buildLiveGcpProofPlan(planEnv({
      PROOFFLEET_FIRESTORE_COLLECTION: "other-proof-effects",
    }));

    expect(first.operation.operationId).not.toBe(sourceChanged.operation.operationId);
    expect(first.operation.operationId).not.toBe(targetChanged.operation.operationId);
  });
});
