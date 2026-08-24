// Model Armor-Adapter: echter Readback via templates.get (und optionalem sanitize-Testaufruf).
// Env: GCP_PROJECT_ID, GCP_REGION, PROOFFLEET_MODEL_ARMOR_TEMPLATE
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

export class ModelArmorAdapter implements GcpAdapter {
  readonly service = 'modelarmor' as const;
  private lastReadbackAt?: string;

  constructor(private readonly cfg: GcpAdapterConfig) {}

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.projectId) missing.push('env GCP_PROJECT_ID fehlt');
    if (!this.cfg.region) missing.push('env GCP_REGION fehlt');
    if (typeof this.cfg.template !== 'string' || !this.cfg.template) {
      missing.push('env PROOFFLEET_MODEL_ARMOR_TEMPLATE fehlt');
    }
    return missing;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return notProvisioned(`Model Armor nicht konfiguriert: ${missing.join('; ')}`);
    }
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`Model Armor Readback fehlgeschlagen (API/IAM/Template pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return noRealReadback(`Konfiguration unvollstaendig (${missing.join('; ')})`);
    }
    let ClientCtor: unknown;
    try {
      const pkg = '@google-cloud/modelarmor'; // nicht-literal: optionale Dep, Aufloesung erst zur Laufzeit
      ({ ModelArmorClient: ClientCtor } = (await import(pkg)) as Record<string, unknown>);
    } catch (err) {
      return noRealReadback(
        `Paket @google-cloud/modelarmor nicht installiert (${(err as Error).message})`,
      );
    }
    try {
      // Regionaler Endpoint; Credentials ausschliesslich via ADC.
      const client = new (ClientCtor as new (o: { apiEndpoint: string }) => {
        getTemplate(req: { name: string }): Promise<[{ name?: string | null }]>;
        sanitizeUserPrompt(req: {
          name: string;
          userPromptData: { text: string };
        }): Promise<[{ sanitizationResult?: unknown }]>;
      })({ apiEndpoint: `modelarmor.${this.cfg.region as string}.rep.googleapis.com` });
      const name = `projects/${this.cfg.projectId as string}/locations/${this.cfg.region as string}/templates/${this.cfg.template as string}`;
      // 1) echter templates.get
      const [tpl] = await client.getTemplate({ name });
      // 2) echter sanitize-Testaufruf mit harmlosem Probe-Prompt
      const [san] = await client.sanitizeUserPrompt({
        name,
        userPromptData: { text: 'prooffleet readback probe: hello' },
      });
      this.lastReadbackAt = new Date().toISOString();
      return {
        ok: true,
        detail: `echter Model Armor templates.get + sanitizeUserPrompt auf ${tpl.name ?? name} erfolgreich (sanitizationResult=${san.sanitizationResult ? 'vorhanden' : 'leer'})`,
      };
    } catch (err) {
      return noRealReadback(`Model Armor templates.get/sanitize fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}

export function createModelArmorAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new ModelArmorAdapter(cfg);
}
