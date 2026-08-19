// Cloud Run-Adapter: echter Readback via services.get (Admin API v2).
// Env: GCP_PROJECT_ID, GCP_REGION, PROOFFLEET_CLOUDRUN_SERVICE
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

export class CloudRunAdapter implements GcpAdapter {
  readonly service = 'cloudrun' as const;
  private lastReadbackAt?: string;

  constructor(private readonly cfg: GcpAdapterConfig) {}

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.projectId) missing.push('env GCP_PROJECT_ID fehlt');
    if (!this.cfg.region) missing.push('env GCP_REGION fehlt');
    if (typeof this.cfg.serviceName !== 'string' || !this.cfg.serviceName) {
      missing.push('env PROOFFLEET_CLOUDRUN_SERVICE fehlt');
    }
    return missing;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return notProvisioned(`Cloud Run nicht konfiguriert: ${missing.join('; ')}`);
    }
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`Cloud Run Readback fehlgeschlagen (API/IAM/Service pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return noRealReadback(`Konfiguration unvollstaendig (${missing.join('; ')})`);
    }
    let ClientCtor: unknown;
    try {
      const pkg = '@google-cloud/run'; // nicht-literal: optionale Dep, Aufloesung erst zur Laufzeit
      ({ ServicesClient: ClientCtor } = (await import(pkg)) as Record<string, unknown>);
    } catch (err) {
      return noRealReadback(`Paket @google-cloud/run nicht installiert (${(err as Error).message})`);
    }
    try {
      // Credentials ausschliesslich via ADC.
      const client = new (ClientCtor as new () => {
        getService(req: {
          name: string;
        }): Promise<[{ name?: string | null; uri?: string | null; reconciling?: boolean | null }]>;
      })();
      const name = `projects/${this.cfg.projectId as string}/locations/${this.cfg.region as string}/services/${this.cfg.serviceName as string}`;
      const [svc] = await client.getService({ name });
      this.lastReadbackAt = new Date().toISOString();
      return {
        ok: true,
        detail: `echter Cloud Run services.get auf ${name} erfolgreich (uri=${svc.uri ?? 'unbekannt'}, reconciling=${String(svc.reconciling)})`,
      };
    } catch (err) {
      return noRealReadback(`services.get fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}

export function createCloudRunAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new CloudRunAdapter(cfg);
}
