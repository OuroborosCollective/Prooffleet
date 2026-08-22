// ProofFleet GCP adapter contracts (SPEC Abschnitt 5).
// Keine Simulation: Adapter melden ehrlich NOT_PROVISIONED, solange kein
// echter Readback gegen die echte GCP-API moeglich war.
import type { ProvisioningStatus } from '../../../src/types/index';

export type GcpServiceName =
  | 'adk'
  | 'cloudrun'
  | 'pubsub'
  | 'firestore'
  | 'secretmanager'
  | 'modelarmor'
  | 'otel';

export interface GcpAdapterStatus {
  status: ProvisioningStatus;
  detail: string;
  lastReadbackAt?: string;
}

/**
 * Structured, non-secret evidence returned only after a real provider call.
 * `evidence` is deliberately metadata-only: no credentials, raw prompt bodies,
 * secret values, or arbitrary database documents belong here.
 */
export interface GcpAdapterReadback {
  ok: boolean;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface GcpAdapter {
  service: GcpServiceName;
  status(): Promise<GcpAdapterStatus>;
  readback(): Promise<GcpAdapterReadback>; // echter Read/Health-Call; NIE ok:true ohne echten Call
}

export interface GcpAdapterConfig {
  projectId?: string;
  region?: string;
  [k: string]: unknown;
}

/** Hilfs-Resultate fuer ehrliche Negativ-Meldungen. */
export function notProvisioned(detail: string): GcpAdapterStatus {
  return { status: 'NOT_PROVISIONED', detail };
}

export function noRealReadback(grund: string): GcpAdapterReadback {
  return { ok: false, detail: `no real readback performed: ${grund}` };
}
