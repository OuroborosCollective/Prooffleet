// OpenTelemetry-Adapter: NodeSDK-Tracing-Init hinter OTEL_ENABLED.
// Ohne Konfiguration: no-op + ehrlicher Status NOT_PROVISIONED.
// Env: OTEL_ENABLED=true, OTEL_EXPORTER_OTLP_ENDPOINT
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

interface TracerLike {
  startSpan(name: string): { end(): void };
}
interface TraceApiLike {
  getTracer(name: string): TracerLike;
}
interface NodeSdkLike {
  start(): void;
  shutdown(): Promise<void>;
}

export class OtelAdapter implements GcpAdapter {
  readonly service = 'otel' as const;
  private sdk?: NodeSdkLike;
  private traceApi?: TraceApiLike;
  private initialized = false;
  private lastReadbackAt?: string;

  constructor(private readonly cfg: GcpAdapterConfig) {}

  private get enabled(): boolean {
    return this.cfg.enabled === true;
  }

  private get endpoint(): string | undefined {
    return typeof this.cfg.endpoint === 'string' && this.cfg.endpoint
      ? this.cfg.endpoint
      : undefined;
  }

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.enabled) missing.push('env OTEL_ENABLED ist nicht gesetzt (no-op)');
    if (!this.endpoint) missing.push('env OTEL_EXPORTER_OTLP_ENDPOINT fehlt (kein Collector konfiguriert)');
    return missing;
  }

  /** Echtes Tracing-Init; wirft bei fehlenden Paketen (Aufrufer faengt ab). */
  private async initSdk(): Promise<void> {
    const endpoint = this.endpoint as string;
    // Nicht-literale Specifier: optionale Deps, Aufloesung erst zur Laufzeit;
    // fehlende Pakete fuehren zu ehrlichem NOT_PROVISIONED statt Build-/Laufzeit-Crash.
    const pkgSdk = '@opentelemetry/sdk-node';
    const pkgExporter = '@opentelemetry/exporter-trace-otlp-http';
    const pkgApi = '@opentelemetry/api';
    const [{ NodeSDK }, { OTLPTraceExporter }, traceApi] = (await Promise.all([
      import(pkgSdk),
      import(pkgExporter),
      import(pkgApi),
    ])) as [
      { NodeSDK: new (o: { traceExporter: unknown }) => NodeSdkLike },
      { OTLPTraceExporter: new (o: { url: string }) => unknown },
      { trace: TraceApiLike },
    ];
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    });
    sdk.start();
    this.sdk = sdk;
    this.traceApi = traceApi.trace;
    this.initialized = true;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return notProvisioned(`OTel nicht konfiguriert: ${missing.join('; ')}`);
    }
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`OTel Readback fehlgeschlagen (Collector/Endpoint pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return noRealReadback(`Tracing deaktiviert/unkonfiguriert (${missing.join('; ')})`);
    }
    if (!this.initialized) {
      try {
        await this.initSdk();
      } catch (err) {
        return noRealReadback(
          `OTel-Init fehlgeschlagen (Pakete @opentelemetry/sdk-node, exporter-trace-otlp-http, api installiert?): ${(err as Error).message}`,
        );
      }
    }
    try {
      // 1) Collector-Endpoint erreichbar? Echter HTTP-Request an den OTLP-Endpoint.
      const res = await fetch(`${(this.endpoint as string).replace(/\/$/, '')}/v1/traces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resourceSpans: [] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok && res.status >= 500) {
        return noRealReadback(`Collector-Endpoint nicht erreichbar (HTTP ${res.status})`);
      }
      // 2) Trace-Export-Verifizierung: echten Span erzeugen und flush erzwingen.
      const span = this.traceApi?.getTracer('prooffleet-readback').startSpan('prooffleet.otel.readback');
      span?.end();
      if (this.sdk) {
        const provider = (this.sdk as unknown as { _tracerProvider?: { forceFlush?: () => Promise<void> } })._tracerProvider;
        await provider?.forceFlush?.();
      }
      this.lastReadbackAt = new Date().toISOString();
      return {
        ok: true,
        detail: `OTel: Collector-Endpoint ${this.endpoint as string} erreichbar und echter Trace-Export (Span prooffleet.otel.readback + forceFlush) durchgefuehrt`,
      };
    } catch (err) {
      return noRealReadback(`Collector-Endpoint/Trace-Export fehlgeschlagen: ${(err as Error).message}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.sdk) await this.sdk.shutdown();
    this.initialized = false;
  }
}

export function createOtelAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new OtelAdapter(cfg);
}
