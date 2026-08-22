// Cloud Run adapter: authoritative services.get readback with fail-closed parser contract.
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

interface CloudRunEnvVarSnapshot { name?: string | null; value?: string | null }
interface CloudRunContainerSnapshot { env?: CloudRunEnvVarSnapshot[] | null }
interface CloudRunServiceSnapshot {
  name?: string | null;
  uri?: string | null;
  reconciling?: boolean | null;
  latestReadyRevision?: string | null;
  latestCreatedRevision?: string | null;
  observedGeneration?: string | number | null;
  template?: { containers?: CloudRunContainerSnapshot[] | null } | null;
}

const SOURCE_SHA = /^[0-9a-f]{40}$/;

function declaredSourceRevisions(svc: CloudRunServiceSnapshot): string[] {
  const containers = svc.template?.containers;
  if (containers != null && !Array.isArray(containers)) {
    throw new Error('Cloud Run template.containers parser contract drifted');
  }
  const values: string[] = [];
  for (const container of containers ?? []) {
    if (!container || typeof container !== 'object') {
      throw new Error('Cloud Run container parser contract drifted');
    }
    if (container.env != null && !Array.isArray(container.env)) {
      throw new Error('Cloud Run container.env parser contract drifted');
    }
    for (const env of container.env ?? []) {
      if (!env || typeof env !== 'object') throw new Error('Cloud Run env parser contract drifted');
      if (env.name === 'PROOFFLEET_SOURCE_REVISION') {
        if (typeof env.value !== 'string' || !SOURCE_SHA.test(env.value)) {
          throw new Error('Cloud Run declared source revision is missing or malformed');
        }
        values.push(env.value);
      }
    }
  }
  return values;
}

export function projectCloudRunReadback(
  requestedName: string,
  svc: CloudRunServiceSnapshot,
  expectedSourceRevision?: string | null,
): GcpAdapterReadback {
  try {
    if (!svc || typeof svc !== 'object') throw new Error('Cloud Run service response is not an object');
    if (typeof svc.name !== 'string' || svc.name !== requestedName) {
      throw new Error(`Cloud Run service identity mismatch: expected ${requestedName}, got ${svc.name ?? '<missing>'}`);
    }
    if (svc.uri != null && (typeof svc.uri !== 'string' || !/^https:\/\//.test(svc.uri))) {
      throw new Error('Cloud Run service URI parser contract drifted');
    }
    if (expectedSourceRevision && !SOURCE_SHA.test(expectedSourceRevision)) {
      throw new Error('expected source revision is malformed');
    }

    const sourceValues = declaredSourceRevisions(svc);
    if (sourceValues.length > 1) {
      throw new Error(`Cloud Run source revision is ambiguous: observed ${sourceValues.length} declarations`);
    }
    const declaredSourceRevision = sourceValues[0] ?? null;
    const sourceRevisionMatchesExpected = expectedSourceRevision
      ? declaredSourceRevision === expectedSourceRevision
      : null;

    const evidence = {
      sourceKind: 'CLOUD_RUN_READBACK',
      parserContract: 'prooffleet.cloudrun-readback.v2',
      serviceName: svc.name,
      uri: svc.uri ?? null,
      reconciling: svc.reconciling ?? null,
      latestReadyRevision: svc.latestReadyRevision ?? null,
      latestCreatedRevision: svc.latestCreatedRevision ?? null,
      observedGeneration: svc.observedGeneration ?? null,
      declaredSourceRevision,
      sourceRevisionMatchesExpected,
    };

    return {
      ok: true,
      detail: `authoritative Cloud Run services.get accepted by parser contract v2 (service=${svc.name}, sourceRevisionMatchesExpected=${String(sourceRevisionMatchesExpected)})`,
      evidence,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `Cloud Run provider response rejected fail-closed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export class CloudRunAdapter implements GcpAdapter {
  readonly service = 'cloudrun' as const;
  private lastReadbackAt?: string;
  constructor(private readonly cfg: GcpAdapterConfig) {}

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.projectId) missing.push('env GCP_PROJECT_ID fehlt');
    if (!this.cfg.region) missing.push('env GCP_REGION fehlt');
    if (typeof this.cfg.serviceName !== 'string' || !this.cfg.serviceName) missing.push('env PROOFFLEET_CLOUDRUN_SERVICE fehlt');
    return missing;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) return notProvisioned(`Cloud Run nicht konfiguriert: ${missing.join('; ')}`);
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`Cloud Run Readback fehlgeschlagen (API/IAM/Service/Parser pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) return noRealReadback(`Konfiguration unvollstaendig (${missing.join('; ')})`);
    let ClientCtor: unknown;
    try {
      const pkg = '@google-cloud/run';
      ({ ServicesClient: ClientCtor } = (await import(pkg)) as Record<string, unknown>);
    } catch (err) {
      return noRealReadback(`Paket @google-cloud/run nicht installiert (${(err as Error).message})`);
    }
    try {
      const client = new (ClientCtor as new () => { getService(req: { name: string }): Promise<[CloudRunServiceSnapshot]> })();
      const name = `projects/${this.cfg.projectId as string}/locations/${this.cfg.region as string}/services/${this.cfg.serviceName as string}`;
      const [svc] = await client.getService({ name });
      const expectedSourceRevision = typeof this.cfg.sourceRevision === 'string' ? this.cfg.sourceRevision : null;
      const projected = projectCloudRunReadback(name, svc, expectedSourceRevision);
      if (projected.ok) this.lastReadbackAt = new Date().toISOString();
      return projected;
    } catch (err) {
      return noRealReadback(`services.get fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}

export function createCloudRunAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new CloudRunAdapter(cfg);
}
