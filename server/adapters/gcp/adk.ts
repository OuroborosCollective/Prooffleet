// ADK/Agent Engine-Adapter: echter Readback via reasoningEngines.get (Vertex AI).
// Env: GCP_PROJECT_ID, GCP_REGION, ADK_AGENT_ENGINE_ID
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

export class AdkAdapter implements GcpAdapter {
  readonly service = 'adk' as const;
  private lastReadbackAt?: string;

  constructor(private readonly cfg: GcpAdapterConfig) {}

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.projectId) missing.push('env GCP_PROJECT_ID fehlt');
    if (!this.cfg.region) missing.push('env GCP_REGION fehlt');
    if (typeof this.cfg.agentEngineId !== 'string' || !this.cfg.agentEngineId) {
      missing.push('env ADK_AGENT_ENGINE_ID fehlt');
    }
    return missing;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return notProvisioned(`ADK/Agent Engine nicht konfiguriert: ${missing.join('; ')}`);
    }
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`ADK Readback fehlgeschlagen (API/IAM/Agent Engine pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return noRealReadback(`Konfiguration unvollstaendig (${missing.join('; ')})`);
    }
    let ClientCtor: unknown;
    try {
      // Vertex AI Reasoning Engine (Agent Engine) Admin-Client.
      const pkg = '@google-cloud/aiplatform'; // nicht-literal: optionale Dep, Aufloesung erst zur Laufzeit
      ({ ReasoningEngineServiceClient: ClientCtor } = (await import(pkg)) as Record<string, unknown>);
    } catch (err) {
      return noRealReadback(
        `Paket @google-cloud/aiplatform nicht installiert (${(err as Error).message})`,
      );
    }
    try {
      // Credentials ausschliesslich via ADC; regionaler Vertex-Endpoint.
      const client = new (ClientCtor as new (o: { apiEndpoint: string }) => {
        getReasoningEngine(req: {
          name: string;
        }): Promise<[{ name?: string | null; displayName?: string | null }]>;
      })({ apiEndpoint: `${this.cfg.region as string}-aiplatform.googleapis.com` });
      const name = `projects/${this.cfg.projectId as string}/locations/${this.cfg.region as string}/reasoningEngines/${this.cfg.agentEngineId as string}`;
      const [engine] = await client.getReasoningEngine({ name });
      this.lastReadbackAt = new Date().toISOString();
      return {
        ok: true,
        detail: `echter Agent-Engine-Ping (reasoningEngines.get) auf ${engine.name ?? name} erfolgreich (displayName=${engine.displayName ?? 'unbekannt'})`,
      };
    } catch (err) {
      return noRealReadback(`reasoningEngines.get fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}

export function createAdkAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new AdkAdapter(cfg);
}
