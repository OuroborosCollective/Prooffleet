// Firestore-Adapter: echter Readback via document get (Metadata-Dokument).
// Env: GCP_PROJECT_ID, PROOFFLEET_FIRESTORE_COLLECTION
import {
  noRealReadback,
  notProvisioned,
  type GcpAdapter,
  type GcpAdapterConfig,
  type GcpAdapterReadback,
  type GcpAdapterStatus,
} from './types';

const PROBE_DOC = 'prooffleet-readback-probe';

export class FirestoreAdapter implements GcpAdapter {
  readonly service = 'firestore' as const;
  private lastReadbackAt?: string;

  constructor(private readonly cfg: GcpAdapterConfig) {}

  private missingConfig(): string[] {
    const missing: string[] = [];
    if (!this.cfg.projectId) missing.push('env GCP_PROJECT_ID fehlt');
    if (typeof this.cfg.collection !== 'string' || !this.cfg.collection) {
      missing.push('env PROOFFLEET_FIRESTORE_COLLECTION fehlt');
    }
    return missing;
  }

  async status(): Promise<GcpAdapterStatus> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return notProvisioned(`Firestore nicht konfiguriert: ${missing.join('; ')}`);
    }
    const rb = await this.readback();
    return rb.ok
      ? { status: 'PROVISIONED_VERIFIED', detail: rb.detail, lastReadbackAt: this.lastReadbackAt }
      : notProvisioned(`Firestore Readback fehlgeschlagen (API/IAM/DB pruefen): ${rb.detail}`);
  }

  async readback(): Promise<GcpAdapterReadback> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return noRealReadback(`Konfiguration unvollstaendig (${missing.join('; ')})`);
    }
    let FirestoreCtor: unknown;
    try {
      const pkg = '@google-cloud/firestore'; // nicht-literal: optionale Dep, Aufloesung erst zur Laufzeit
      ({ Firestore: FirestoreCtor } = (await import(pkg)) as Record<string, unknown>);
    } catch (err) {
      return noRealReadback(
        `Paket @google-cloud/firestore nicht installiert (${(err as Error).message})`,
      );
    }
    try {
      // Credentials ausschliesslich via ADC (Application Default Credentials).
      const db = new (FirestoreCtor as new (o: { projectId: string }) => {
        collection(n: string): { doc(id: string): { get(): Promise<{ exists: boolean }> } };
      })({ projectId: this.cfg.projectId as string });
      const snap = await db
        .collection(this.cfg.collection as string)
        .doc(PROBE_DOC)
        .get();
      this.lastReadbackAt = new Date().toISOString();
      // Ein echter get() lieferte eine Antwort; exists=false ist ebenfalls valide Provisionierung.
      return {
        ok: true,
        detail: `echter Firestore document get auf ${this.cfg.collection as string}/${PROBE_DOC} erfolgreich (exists=${snap.exists})`,
      };
    } catch (err) {
      return noRealReadback(`Firestore get fehlgeschlagen: ${(err as Error).message}`);
    }
  }
}

export function createFirestoreAdapter(cfg: GcpAdapterConfig): GcpAdapter {
  return new FirestoreAdapter(cfg);
}
