/**
 * memoryStore.ts — agent working notes (memory), strictly separated from evidence.
 *
 * Memory entries are NOT runtime evidence and are never accepted by the
 * IndependentVerifier or the Judge. Structural separation is enforced:
 * MemoryEntry lacks every binding field of EvidenceBlock (blockIndex,
 * manifestHash, missionRevision, previousHash, blockHash), so a MemoryEntry
 * cannot be passed to seal() or any evidence path at the type level.
 */

export interface MemoryEntry {
  key: string;
  value: unknown;
  updatedAt: string;
  /** Discriminator — deliberately incompatible with EvidenceBlock. */
  kind: 'memory';
}

export class MemoryStore {
  private readonly namespaces = new Map<string, Map<string, MemoryEntry>>();

  private ns(namespace: string): Map<string, MemoryEntry> {
    let map = this.namespaces.get(namespace);
    if (!map) {
      map = new Map();
      this.namespaces.set(namespace, map);
    }
    return map;
  }

  /** Store an agent note in its own namespace. */
  set(namespace: string, key: string, value: unknown): MemoryEntry {
    const entry: MemoryEntry = {
      key,
      value,
      updatedAt: new Date().toISOString(),
      kind: 'memory',
    };
    this.ns(namespace).set(key, entry);
    return { ...entry };
  }

  get(namespace: string, key: string): MemoryEntry | undefined {
    const entry = this.namespaces.get(namespace)?.get(key);
    return entry ? { ...entry } : undefined;
  }

  /** All notes of one namespace (copies). */
  getAll(namespace: string): MemoryEntry[] {
    return Array.from(this.namespaces.get(namespace)?.values() ?? []).map((e) => ({ ...e }));
  }

  /**
   * Runtime guard: memory entries are structurally unsealable. Any attempt to
   * push a memory entry into an evidence path is rejected explicitly.
   */
  static assertNotEvidence(value: unknown): asserts value is MemoryEntry {
    const v = value as Partial<MemoryEntry> | null | undefined;
    if (!v || v.kind !== 'memory') {
      throw new Error('assertNotEvidence: value is not a MemoryEntry');
    }
    const suspect = value as Record<string, unknown>;
    if ('blockHash' in suspect || 'manifestHash' in suspect || 'blockIndex' in suspect) {
      throw new Error('assertNotEvidence: memory entry carries evidence fields — rejected');
    }
  }
}
