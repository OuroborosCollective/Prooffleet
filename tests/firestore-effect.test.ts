import { describe, expect, it } from 'vitest';

import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence';
import {
  FirestoreEffectHandler,
  FirestoreOperatorExecutor,
  createFirestoreOperatorExecutor,
  type FirestoreEffectIdentity,
  type FirestoreEffectSnapshot,
  type FirestoreEffectStore,
} from '../server/ops/firestoreEffect';
import type { OperationSpec } from '../src/types';

const REV_A = 'a'.repeat(40);
const REV_B = 'b'.repeat(40);

class MemoryStore implements FirestoreEffectStore {
  readonly projectId = 'project-test';
  readonly collection = 'proof-effects';
  private docs = new Map<string, FirestoreEffectIdentity | Record<string, unknown>>();
  setCalls = 0;

  async get(documentId: string): Promise<FirestoreEffectSnapshot> {
    const data = this.docs.get(documentId);
    return data ? { exists: true, data: structuredClone(data) } : { exists: false };
  }

  async set(documentId: string, data: FirestoreEffectIdentity): Promise<void> {
    this.setCalls += 1;
    this.docs.set(documentId, structuredClone(data));
  }

  seed(documentId: string, data: Record<string, unknown>) {
    this.docs.set(documentId, structuredClone(data));
  }
}

function spec(operationId = 'op-proof-1', sourceRevision = REV_A): OperationSpec {
  const parameters = { goalHash: sha256Hex('goal'), missionRevision: 1, sourceRevision };
  return {
    operationId,
    kind: 'write',
    actionName: 'record_mission_proof',
    targetResource: 'firestore:proof-effects',
    parameters,
    parametersHash: sha256Hex(canonicalJson(parameters)),
    missionId: 'mission-1',
    missionRevision: 1,
  };
}

function grantFor(operation: OperationSpec) {
  const consent = new ConsentEngine();
  const request = consent.createRequest(operation, 'HIGH', 'test');
  const grant = consent.respond(request.requestId, 'APPROVED', 'owner', 'approved');
  if (!grant) throw new Error('expected grant');
  return grant;
}

describe('Firestore proof effect', () => {
  it('applies once and returns authoritative Firestore readback evidence', async () => {
    const store = new MemoryStore();
    const operation = spec('op-first');
    const executor = new FirestoreOperatorExecutor(store, REV_A);
    const result = await executor.execute(operation, grantFor(operation));
    expect(result.status).toBe('applied');
    expect(result.sourceKind).toBe('FIRESTORE_READBACK');
    expect(result.sourceRevision).toBe(REV_A);
    expect(store.setCalls).toBe(1);
  });

  it('treats an exact existing effect as already_applied and does not write again', async () => {
    const store = new MemoryStore();
    const operation = spec('op-existing');
    const handler = new FirestoreEffectHandler(store, REV_A);
    await handler.apply(operation);
    const executor = new FirestoreOperatorExecutor(store, REV_A);
    const result = await executor.execute(operation, grantFor(operation));
    expect(result.status).toBe('already_applied');
    expect(store.setCalls).toBe(1);
  });

  it('fails closed when the same operationId already contains a different identity', async () => {
    const store = new MemoryStore();
    const operation = spec('op-conflict');
    store.seed(operation.operationId, {
      schemaVersion: 'prooffleet.firestore-effect.v1',
      operationId: operation.operationId,
      missionId: operation.missionId,
      missionRevision: operation.missionRevision,
      actionName: operation.actionName,
      targetResource: operation.targetResource,
      parametersHash: 'different-parameters-hash',
      sourceRevision: REV_A,
    });
    const executor = new FirestoreOperatorExecutor(store, REV_A);
    const result = await executor.execute(operation, grantFor(operation));
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('readback conflict');
    expect(store.setCalls).toBe(0);
  });

  it('never writes when parametersHash does not match canonical parameters', async () => {
    const store = new MemoryStore();
    const operation = { ...spec('op-bad-hash'), parametersHash: '0'.repeat(64) };
    const executor = new FirestoreOperatorExecutor(store, REV_A);
    const result = await executor.execute(operation, grantFor(operation));
    expect(result.status).toBe('failed');
    expect(store.setCalls).toBe(0);
  });

  it('rejects an operation spec bound to a different source revision before write', async () => {
    const store = new MemoryStore();
    const operation = spec('op-revision-mismatch', REV_A);
    const executor = new FirestoreOperatorExecutor(store, REV_B);
    const result = await executor.execute(operation, grantFor(operation));
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('readback failed');
    expect(store.setCalls).toBe(0);
  });

  it('keeps the real effect executor unavailable when exact source revision is missing or malformed', async () => {
    expect(await createFirestoreOperatorExecutor({
      GCP_PROJECT_ID: 'project-test',
      PROOFFLEET_FIRESTORE_COLLECTION: 'proof-effects',
      PROOFFLEET_SOURCE_REVISION: '',
    })).toBeUndefined();

    expect(await createFirestoreOperatorExecutor({
      GCP_PROJECT_ID: 'project-test',
      PROOFFLEET_FIRESTORE_COLLECTION: 'proof-effects',
      PROOFFLEET_SOURCE_REVISION: 'not-a-git-sha',
    })).toBeUndefined();
  });
});
