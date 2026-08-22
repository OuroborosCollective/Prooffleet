import { describe, expect, it } from 'vitest';

import {
  ADK_CANARY_OUTCOME,
  ADK_CANARY_SCHEMA_VERSION,
  runAdkRuntimeCanary,
} from '../server/adkCanary';
import { sha256Hex } from '../server/evidence/canonicalJson';
import {
  PROOFFLEET_GEMINI_MODEL,
  PROOFFLEET_GEMINI_PROVIDER,
} from '../server/gemini';

const SOURCE_REVISION = '1234567890abcdef1234567890abcdef12345678';
const NONCE = '12345678-1234-1234-1234-1234567890ab';
const CHALLENGE = 'PROOFFLEET_ADK_CANARY_123456781234123412341234567890ab';

function matchingProvider() {
  return {
    models: {
      generateContent: async ({ contents }: { model: string; contents: string }) => {
        const challenge = contents.split('\n').at(-1) ?? '';
        return { text: `${challenge}\n` };
      },
    },
  };
}

describe('ADK live canary truth boundary', () => {
  it('produces a hash-only ADK_RUNTIME_OBSERVED receipt for an exact challenge response', async () => {
    const receipt = await runAdkRuntimeCanary(SOURCE_REVISION, {
      providerFactory: matchingProvider,
      nonceFactory: () => NONCE,
      now: () => new Date('2026-08-20T21:00:00.000Z'),
    });

    expect(receipt).toEqual({
      schemaVersion: ADK_CANARY_SCHEMA_VERSION,
      outcome: ADK_CANARY_OUTCOME,
      sourceRevision: SOURCE_REVISION,
      framework: PROOFFLEET_GEMINI_PROVIDER,
      modelId: PROOFFLEET_GEMINI_MODEL,
      challengeSha256: sha256Hex(CHALLENGE),
      responseSha256: sha256Hex(CHALLENGE),
      challengeMatched: true,
      finalResponseObserved: true,
      observedAt: '2026-08-20T21:00:00.000Z',
    });

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(CHALLENGE);
    expect(serialized).not.toContain('Return exactly');
    expect(serialized).not.toContain('GOOGLE_API_KEY');
    expect(serialized).not.toContain('GEMINI_API_KEY');
  });

  it('rejects malformed source revision before any provider call', async () => {
    let providerCalled = false;
    await expect(runAdkRuntimeCanary('main', {
      providerFactory: () => {
        providerCalled = true;
        return matchingProvider();
      },
    })).rejects.toThrow('adk_canary_source_revision_invalid');
    expect(providerCalled).toBe(false);
  });

  it('fails closed when the production ADK provider is not configured', async () => {
    await expect(runAdkRuntimeCanary(SOURCE_REVISION, {
      providerFactory: () => null,
      nonceFactory: () => NONCE,
    })).rejects.toThrow('adk_canary_provider_not_configured');
  });

  it('fails closed on an empty final response', async () => {
    await expect(runAdkRuntimeCanary(SOURCE_REVISION, {
      providerFactory: () => ({
        models: {
          generateContent: async () => ({ text: '   ' }),
        },
      }),
      nonceFactory: () => NONCE,
    })).rejects.toThrow('adk_canary_empty_final_response');
  });

  it('fails closed when the live model does not echo the fresh challenge exactly', async () => {
    await expect(runAdkRuntimeCanary(SOURCE_REVISION, {
      providerFactory: () => ({
        models: {
          generateContent: async () => ({ text: 'STALE_OR_WRONG_RESPONSE' }),
        },
      }),
      nonceFactory: () => NONCE,
    })).rejects.toThrow('adk_canary_challenge_mismatch');
  });

  it('rejects a weak or malformed nonce before making a model call', async () => {
    let generated = false;
    await expect(runAdkRuntimeCanary(SOURCE_REVISION, {
      providerFactory: () => ({
        models: {
          generateContent: async () => {
            generated = true;
            return { text: '' };
          },
        },
      }),
      nonceFactory: () => 'tiny',
    })).rejects.toThrow('adk_canary_nonce_invalid');
    expect(generated).toBe(false);
  });
});
