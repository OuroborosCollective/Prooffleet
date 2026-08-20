import { describe, expect, it } from 'vitest';

import { ConsentEngine } from '../server/consent/consentEngine';
import { canonicalJson, sha256Hex } from '../server/evidence';
import {
  FirestoreEffectHandler,
  FirestoreOperatorExecutor,
  type FirestoreEffectIdentity,
  type FirestoreEffectSnapshot,
  type FirestoreEffectStore,
} from '../server/ops/firestoreEffect';
import type { OperationSpec } from '../src/types';

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

function spec(operationId = 'op-proof-1'): OperationSpec {
  const parameters = { goalHash: sha256Hex('goal'), missionRevision: 1 };
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
    const executor = new FirestoreOperatorExecutor(store, 'sha-source-1');

    const result = await executor.execute(operation, grantFor(operation));

    expect(result.status).toBe('applied');
    expect(result.sourceKind).toBe('FIRESTORE_READBACK');
    expect(result.sourceRevision).toBe('sha-source-1');
    expect(store.setCalls).toBe(1);
    expect(result.readbackEvidence).toEqual(expect.objectContaining({
      applied: true,
      conflict: false,
      projectId: 'project-test',
      collection: 'proof-effects',
      documentId: operation.operationId,
      operationId: operation.operationId,
      sourceKind: 'FIRESTORE_READBACK',
    }));
  });

  it('treats an exact existing effect as already_applied and does not write again', async () => {
    const store = new MemoryStore();
    const operation = spec('op-existing');
    const handler = new FirestoreEffectHandler(store, 'sha-source-1');
    await handler.apply(operation);
    expect(store.setCalls).toBe(1);

    const executor = new FirestoreOperatorExecutor(store, 'sha-source-1');
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
      sourceRevision: 'sha-source-1',
    });

    const executor = new FirestoreOperatorExecutor(store, 'sha-source-1');
    const result = await executor.execute(operation, grantFor(operation));

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('readback conflict');
    expect(store.setCalls).toBe(0);
  });

  it('never writes when parametersHash does not match canonical parameters', async () => {
    const store = new MemoryStore();
    const operation = { ...spec('op-bad-hash'), parametersHash: '0'.repeat(64) };
    const executor = new FirestoreOperatorExecutor(store, 'sha-source-1');

    const result = await executor.execute(operation, grantFor(operation));

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('readback failed');
    expect(store.setCalls).toBe(0);
  });

  it('treats a source-revision mismatch as an identity conflict', async () => {
    const store = new MemoryStore();
    const operation = spec('op-revision-conflict');
    const oldHandler = new FirestoreEffectHandler(store, 'sha-old');
    await oldHandler.apply(operation);
    expect(store.setCalls).toBe(1);

    const executor = new FirestoreOperatorExecutor(store, 'sha-new');
    const result = await executor.execute(operation, grantFor(operation));

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('readback conflict');
    expect(store.setCalls).toBe(1);
  });
});
