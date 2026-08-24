// Fabrik fuer alle sieben GCP-Adapter + Re-exports (SPEC Abschnitt 5).
import { createAdkAdapter } from './adk';
import { createCloudRunAdapter } from './cloudrun';
import { createFirestoreAdapter } from './firestore';
import { createModelArmorAdapter } from './modelarmor';
import { createOtelAdapter } from './otel';
import { createPubSubAdapter } from './pubsub';
import { createSecretManagerAdapter } from './secretmanager';
import type { GcpAdapter, GcpAdapterConfig } from './types';

function baseConfig(env: NodeJS.ProcessEnv): GcpAdapterConfig {
  return {
    projectId: env.GCP_PROJECT_ID,
    region: env.GCP_REGION,
  };
}

/**
 * Erzeugt alle sieben Adapter aus der Prozess-Umgebung.
 * Fehlende Env-Vars fuehren NICHT zu Fehlern hier, sondern zu ehrlichem
 * NOT_PROVISIONED beim jeweiligen status()/readback().
 */
export function createGcpAdapters(env: NodeJS.ProcessEnv): GcpAdapter[] {
  const base = baseConfig(env);
  return [
    createAdkAdapter({ ...base, agentEngineId: env.ADK_AGENT_ENGINE_ID }),
    createCloudRunAdapter({ ...base, serviceName: env.PROOFFLEET_CLOUDRUN_SERVICE }),
    createPubSubAdapter({ ...base, topic: env.PROOFFLEET_PUBSUB_TOPIC }),
    createFirestoreAdapter({ ...base, collection: env.PROOFFLEET_FIRESTORE_COLLECTION }),
    createSecretManagerAdapter({ ...base, secretName: env.PROOFFLEET_SECRET_NAME }),
    createModelArmorAdapter({ ...base, template: env.PROOFFLEET_MODEL_ARMOR_TEMPLATE }),
    createOtelAdapter({
      enabled: env.OTEL_ENABLED === 'true',
      endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
  ];
}

export { AdkAdapter, createAdkAdapter } from './adk';
export { CloudRunAdapter, createCloudRunAdapter } from './cloudrun';
export { FirestoreAdapter, createFirestoreAdapter } from './firestore';
export { ModelArmorAdapter, createModelArmorAdapter } from './modelarmor';
export { OtelAdapter, createOtelAdapter } from './otel';
export { PubSubAdapter, createPubSubAdapter } from './pubsub';
export { SecretManagerAdapter, createSecretManagerAdapter } from './secretmanager';
export {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
  type GcpServiceName,
} from './types';
