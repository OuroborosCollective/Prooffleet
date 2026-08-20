import { canonicalJson, sha256Hex } from '../evidence/canonicalJson';
import {
  OperationExecutor,
  type GrantValidator,
  type OperationHandler,
  type OperationResult,
} from './operationExecutor';
import type { ConsentGrant, OperationSpec } from '../../src/types/index';
import type { OperatorExecutionResult, OperatorExecutor } from '../agents/operator';

const EFFECT_SCHEMA = 'prooffleet.firestore-effect.v1';

export interface FirestoreEffectIdentity {
  schemaVersion: typeof EFFECT_SCHEMA;
  operationId: string;
  missionId: string;
  missionRevision: number;
  actionName: string;
  targetResource: string;
  parametersHash: string;
  sourceRevision: string | null;
}

export interface FirestoreEffectSnapshot {
  exists: boolean;
  data?: Record<string, unknown>;
}

export interface FirestoreEffectStore {
  readonly projectId: string;
  readonly collection: string;
  get(documentId: string): Promise<FirestoreEffectSnapshot>;
  set(documentId: string, data: FirestoreEffectIdentity): Promise<void>;
}

function expectedIdentity(
  spec: OperationSpec,
  collection: string,
  sourceRevision: string | null,
): FirestoreEffectIdentity {
  if (spec.kind !== 'write' && spec.kind !== 'execute') {
    throw new Error(`Firestore effect requires write/execute operation, got ${spec.kind}`);
  }
  const expectedTarget = `firestore:${collection}`;
  if (spec.targetResource !== expectedTarget) {
    throw new Error(`targetResource mismatch: expected ${expectedTarget}`);
  }
  const computedParametersHash = sha256Hex(canonicalJson(spec.parameters));
  if (computedParametersHash !== spec.parametersHash) {
    throw new Error('parametersHash mismatch');
  }
  return {
    schemaVersion: EFFECT_SCHEMA,
    operationId: spec.operationId,
    missionId: spec.missionId,
    missionRevision: spec.missionRevision,
    actionName: spec.actionName,
    targetResource: spec.targetResource,
    parametersHash: spec.parametersHash,
    sourceRevision,
  };
}

function projectObservedIdentity(data: Record<string, unknown>): Partial<FirestoreEffectIdentity> {
  return {
    schemaVersion: data.schemaVersion as typeof EFFECT_SCHEMA | undefined,
    operationId: typeof data.operationId === 'string' ? data.operationId : undefined,
    missionId: typeof data.missionId === 'string' ? data.missionId : undefined,
    missionRevision: typeof data.missionRevision === 'number' ? data.missionRevision : undefined,
    actionName: typeof data.actionName === 'string' ? data.actionName : undefined,
    targetResource: typeof data.targetResource === 'string' ? data.targetResource : undefined,
    parametersHash: typeof data.parametersHash === 'string' ? data.parametersHash : undefined,
    sourceRevision: typeof data.sourceRevision === 'string' || data.sourceRevision === null
      ? data.sourceRevision as string | null
      : undefined,
  };
}

function identitiesEqual(expected: FirestoreEffectIdentity, observed: Partial<FirestoreEffectIdentity>): boolean {
  return canonicalJson(expected) === canonicalJson(observed);
}

export class FirestoreEffectHandler implements OperationHandler {
  constructor(
    private readonly store: FirestoreEffectStore,
    private readonly sourceRevision: string | null,
  ) {}

  async apply(spec: OperationSpec): Promise<void> {
    const expected = expectedIdentity(spec, this.store.collection, this.sourceRevision);
    await this.store.set(spec.operationId, expected);
  }

  async readback(spec: OperationSpec): Promise<unknown> {
    const expected = expectedIdentity(spec, this.store.collection, this.sourceRevision);
    const snapshot = await this.store.get(spec.operationId);
    if (!snapshot.exists) return null;

    const observed = projectObservedIdentity(snapshot.data ?? {});
    const identityHash = sha256Hex(canonicalJson(observed));
    const common = {
      sourceKind: 'FIRESTORE_READBACK',
      projectId: this.store.projectId,
      collection: this.store.collection,
      documentId: spec.operationId,
      operationId: spec.operationId,
      sourceRevision: this.sourceRevision,
      observedIdentityHash: identityHash,
    };

    if (!identitiesEqual(expected, observed)) {
      return {
        applied: false,
        conflict: true,
        ...common,
      };
    }

    return {
      applied: true,
      conflict: false,
      ...common,
    };
  }
}

export class FirestoreOperatorExecutor implements OperatorExecutor {
  private readonly core: OperationExecutor;
  private readonly handler: FirestoreEffectHandler;

  constructor(
    store: FirestoreEffectStore,
    sourceRevision: string | null,
    grantValidator?: GrantValidator,
  ) {
    this.core = new OperationExecutor(grantValidator ? { grantValidator } : {});
    this.handler = new FirestoreEffectHandler(store, sourceRevision);
  }

  async execute(specValue: unknown, grantValue?: ConsentGrant): Promise<OperatorExecutionResult> {
    const spec = specValue as OperationSpec;
    const result: OperationResult = await this.core.execute(spec, this.handler, grantValue);
    const evidence = result.readbackEvidence as Record<string, unknown> | undefined;
    const sourceKind = evidence?.sourceKind === 'FIRESTORE_READBACK'
      ? 'FIRESTORE_READBACK' as const
      : undefined;
    const sourceRevision = typeof evidence?.sourceRevision === 'string'
      ? evidence.sourceRevision
      : undefined;

    return {
      status: result.status,
      detail: result.error,
      readbackEvidence: result.readbackEvidence,
      sourceKind,
      sourceRevision,
    };
  }
}

export interface FirestoreEffectEnvironment {
  GCP_PROJECT_ID?: string;
  PROOFFLEET_FIRESTORE_COLLECTION?: string;
  PROOFFLEET_SOURCE_REVISION?: string;
}

export async function createRealFirestoreEffectStore(
  env: FirestoreEffectEnvironment,
): Promise<FirestoreEffectStore | null> {
  const projectId = env.GCP_PROJECT_ID?.trim();
  const collection = env.PROOFFLEET_FIRESTORE_COLLECTION?.trim();
  if (!projectId || !collection) return null;

  let FirestoreCtor: unknown;
  try {
    const pkg = '@google-cloud/firestore';
    ({ Firestore: FirestoreCtor } = (await import(pkg)) as Record<string, unknown>);
  } catch {
    return null;
  }

  const db = new (FirestoreCtor as new (options: { projectId: string }) => {
    collection(name: string): {
      doc(id: string): {
        get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
        set(data: Record<string, unknown>): Promise<unknown>;
      };
    };
  })({ projectId });

  return {
    projectId,
    collection,
    async get(documentId: string): Promise<FirestoreEffectSnapshot> {
      const snapshot = await db.collection(collection).doc(documentId).get();
      return {
        exists: snapshot.exists,
        data: snapshot.exists ? snapshot.data() : undefined,
      };
    },
    async set(documentId: string, data: FirestoreEffectIdentity): Promise<void> {
      await db.collection(collection).doc(documentId).set(data);
    },
  };
}

export async function createFirestoreOperatorExecutor(
  env: FirestoreEffectEnvironment,
  grantValidator?: GrantValidator,
): Promise<FirestoreOperatorExecutor | undefined> {
  // Runtime proof is revision-bound. If the deployment did not inject the
  // exact immutable source revision, the real effect path remains unavailable.
  const sourceRevision = env.PROOFFLEET_SOURCE_REVISION?.trim();
  if (!sourceRevision) return undefined;

  const store = await createRealFirestoreEffectStore(env);
  if (!store) return undefined;
  return new FirestoreOperatorExecutor(store, sourceRevision, grantValidator);
}
