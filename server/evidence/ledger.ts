/**
 * ledger.ts — append-only EvidenceLedger (replaces server/evidenceEngine.ts).
 *
 * Hard rules:
 * - seal() binds blockIndex, agentId, claim, canonicalJSON(payload),
 *   manifestHash, missionRevision and previousHash into the block hash.
 * - NO producer-side score parameter anywhere. No producer-side verificationStatus:
 *   a sealed block is raw evidence; only IndependentVerifier/Judge may judge it.
 * - Optional HMAC uses ONLY process.env.PROOFFLEET_HMAC_SECRET. Without the
 *   secret, signature is honestly null. Keys are NEVER derived from agentId.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson, sha256Hex } from './canonicalJson';
import type { EvidenceBlock } from '../../src/types/index';

// Single definition lives in src/types/index.ts (SPEC §6 dedupe) — re-exported here.
export type { EvidenceBlock } from '../../src/types/index';
export { sha256Hex } from './canonicalJson';

export interface SealInput {
  agentId: string;
  claim: string;
  payload: unknown;
  manifestHash: string;
  missionRevision: number;
}

export interface LedgerVerification {
  isValid: boolean;
  /** Index of the first block that fails recomputation, if any. */
  brokenAt: number | null;
}

export function computeBlockHash(
  block: Omit<EvidenceBlock, 'blockHash' | 'sealedAt' | 'signature'>,
): string {
  return sha256Hex(
    canonicalJson({
      blockIndex: block.blockIndex,
      agentId: block.agentId,
      claim: block.claim,
      payloadCanonical: canonicalJson(block.payload),
      manifestHash: block.manifestHash,
      missionRevision: block.missionRevision,
      previousHash: block.previousHash,
    }),
  );
}

function hmacKey(): string | null {
  const secret = process.env.PROOFFLEET_HMAC_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/** Sign with the env secret only; returns null honestly when not configured. */
export function signBlockHash(blockHash: string): string | null {
  const key = hmacKey();
  if (!key) return null;
  return createHmac('sha256', key).update(blockHash, 'utf8').digest('hex');
}

export function verifyBlockSignature(blockHash: string, signature: string | null): boolean {
  if (signature === null) return false;
  const expected = signBlockHash(blockHash);
  if (expected === null) return false;
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const GENESIS_HASH = 'GENESIS';

export class EvidenceLedger {
  private readonly blocks: EvidenceBlock[] = [];

  get size(): number {
    return this.blocks.length;
  }

  /** Append a new block and seal it. No truth score, no self-verification. */
  seal(input: SealInput): EvidenceBlock {
    const partial = {
      blockIndex: this.blocks.length,
      agentId: input.agentId,
      claim: input.claim,
      payload: input.payload,
      payloadHash: sha256Hex(canonicalJson(input.payload)),
      manifestHash: input.manifestHash,
      missionRevision: input.missionRevision,
      previousHash:
        this.blocks.length === 0 ? GENESIS_HASH : this.blocks[this.blocks.length - 1].blockHash,
    };
    const blockHash = computeBlockHash(partial);
    const block: EvidenceBlock = {
      ...partial,
      blockHash,
      sealedAt: new Date().toISOString(),
      signature: signBlockHash(blockHash),
    };
    this.blocks.push(block);
    return { ...block };
  }

  /** Read-only snapshot (shallow copies; treat as immutable). */
  getChain(): EvidenceBlock[] {
    return this.blocks.map((b) => ({ ...b }));
  }

  /** Recompute every hash and the chain linkage; never trusts stored values. */
  verifyChain(chain?: EvidenceBlock[]): LedgerVerification {
    const blocks = chain ?? this.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const expectedPrev = i === 0 ? GENESIS_HASH : blocks[i - 1].blockHash;
      if (b.blockIndex !== i || b.previousHash !== expectedPrev) {
        return { isValid: false, brokenAt: i };
      }
      if (b.payloadHash !== sha256Hex(canonicalJson(b.payload))) {
        return { isValid: false, brokenAt: i };
      }
      const recomputed = computeBlockHash(b);
      if (b.blockHash !== recomputed) {
        return { isValid: false, brokenAt: i };
      }
    }
    return { isValid: true, brokenAt: null };
  }
}
