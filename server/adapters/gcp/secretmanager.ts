// Secret Manager-Adapter: echter Readback via accessSecretVersion (latest).
// Env: GCP_PROJECT_ID, PROOFFLEET_SECRET_NAME
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

export class SecretManagerAdapter implements GcpAdapter {
  readonly service = 'secretmanager' as const;
  private lastReadbackAt?: string;

  constructor(private readonly cfg: GcpAdapterConfig) {}

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.projectId) missing.push('env GCP_PROJECT_ID fehlt');
    if (typeof this.cfg.secretName !== 'string' || !this.cfg.secretName) {
      missing.push('env PROOFFLEET_SECRET_NAME fehlt');
    }
    return missing;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return notProvisioned(`Secret Manager nicht konfiguriert: ${missing.join('; ')}`);
    }
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`Secret Manager Readback fehlgeschlagen (API/IAM/Secret pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return noRealReadback(`Konfiguration unvollstaendig (${missing.join('; ')})`);
    }
    let ClientCtor: unknown;
    try {
      const pkg = '@google-cloud/secret-manager'; // nicht-literal: optionale Dep, Aufloesung erst zur Laufzeit
      ({ SecretManagerServiceClient: ClientCtor } = (await import(pkg)) as Record<string, unknown>);
    } catch (err) {
      return noRealReadback(
        `Paket @google-cloud/secret-manager nicht installiert (${(err as Error).message})`,
      );
    }
    try {
      // Credentials ausschliesslich via ADC.
      const client = new (ClientCtor as new () => {
        accessSecretVersion(req: {
          name: string;
        }): Promise<[{ payload?: { data?: Uint8Array | string | null } }]>
      })();
      const name = `projects/${this.cfg.projectId as string}/secrets/${this.cfg.secretName as string}/versions/latest`;
      const [version] = await client.accessSecretVersion({ name });
      this.lastReadbackAt = new Date().toISOString();
      const len = version.payload?.data ? String(version.payload.data).length : 0;
      // Niemals Secret-Material in die Detail-Meldung uebernehmen.
      return {
        ok: true,
        detail: `echter accessSecretVersion auf ${name} erfolgreich (payload length=${len}, Wert wird nicht geloggt)`,
      };
    } catch (err) {
      return noRealReadback(`accessSecretVersion fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}

export function createSecretManagerAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new SecretManagerAdapter(cfg);
}
