// Pub/Sub-Adapter: echter Readback via topic.get().
// Env: GCP_PROJECT_ID, PROOFFLEET_PUBSUB_TOPIC
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

export class PubSubAdapter implements GcpAdapter {
  readonly service = 'pubsub' as const;
  private lastReadbackAt?: string;

  constructor(private readonly cfg: GcpAdapterConfig) {}

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.projectId) missing.push('env GCP_PROJECT_ID fehlt');
    if (typeof this.cfg.topic !== 'string' || !this.cfg.topic) {
      missing.push('env PROOFFLEET_PUBSUB_TOPIC fehlt');
    }
    return missing;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return notProvisioned(`Pub/Sub nicht konfiguriert: ${missing.join('; ')}`);
    }
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`Pub/Sub Readback fehlgeschlagen (API/IAM/Topic pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return noRealReadback(`Konfiguration unvollstaendig (${missing.join('; ')})`);
    }
    let PubSubCtor: unknown;
    try {
      const pkg = '@google-cloud/pubsub'; // nicht-literal: optionale Dep, Aufloesung erst zur Laufzeit
      ({ PubSub: PubSubCtor } = (await import(pkg)) as Record<string, unknown>);
    } catch (err) {
      return noRealReadback(`Paket @google-cloud/pubsub nicht installiert (${(err as Error).message})`);
    }
    try {
      // Credentials ausschliesslich via ADC.
      const pubsub = new (PubSubCtor as new (o: { projectId: string }) => {
        topic(n: string): { get(): Promise<[unknown]> };
      })({ projectId: this.cfg.projectId as string });
      await pubsub.topic(this.cfg.topic as string).get();
      this.lastReadbackAt = new Date().toISOString();
      return {
        ok: true,
        detail: `echter Pub/Sub topic.get auf ${this.cfg.topic as string} erfolgreich`,
      };
    } catch (err) {
      return noRealReadback(`topic.get fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}

export function createPubSubAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new PubSubAdapter(cfg);
}
