/**
 * canonicalJson.ts — deterministic JSON serialization for all hashing.
 * Keys are sorted recursively; undefined values are dropped (like JSON.stringify),
 * so hashing is stable regardless of object key insertion order.
 *
 * Also hosts sha256Hex: the single SHA-256 helper for ALL server modules
 * (consent/ops import it from here — see SPEC integration notes).
 */

import { createHash } from 'node:crypto';

export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      if (src[key] !== undefined) {
        out[key] = sortValue(src[key]);
      }
    }
    return out;
  }
  return value;
}
