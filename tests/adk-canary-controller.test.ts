import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AdkRuntimeCanaryController } from '../server/adkCanaryController';

const SOURCE_REVISION = '1234567890abcdef1234567890abcdef12345678';
const NONCE = '12345678-1234-1234-1234-1234567890ab';

function matchingProvider(counter?: { calls: number }) {
  return {
    models: {
      generateContent: async ({ contents }: { model: string; contents: string }) => {
        if (counter) counter.calls += 1;
        const challenge = contents.split('\n').at(-1) ?? '';
        return { text: challenge };
      },
    },
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(here, '../server.ts'), 'utf8');

describe('ADK runtime canary controller', () => {
  it('is ineligible without an exact immutable source revision and never calls the provider', async () => {
    const controller = new AdkRuntimeCanaryController('main');
    let providerCalled = false;

    expect(controller.snapshot()).toEqual({
      eligible: false,
      sourceRevision: null,
      status: 'NOT_RUN',
      receipt: null,
      failureReason: null,
    });

    const result = await controller.trigger({
      providerFactory: () => {
        providerCalled = true;
        return matchingProvider();
      },
    });

    expect(providerCalled).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toBe('adk_canary_runtime_not_source_bound');
  });

  it('deduplicates concurrent triggers into exactly one provider call', async () => {
    const controller = new AdkRuntimeCanaryController(SOURCE_REVISION);
    const counter = { calls: 0 };

    const dependencies = {
      providerFactory: () => matchingProvider(counter),
      nonceFactory: () => NONCE,
      now: () => new Date('2026-08-20T21:00:00.000Z'),
    };

    const results = await Promise.all(
      Array.from({ length: 25 }, () => controller.trigger(dependencies)),
    );

    expect(counter.calls).toBe(1);
    expect(results.every((result) => result.status === 'OBSERVED')).toBe(true);
    expect(results.every((result) => result.receipt?.sourceRevision === SOURCE_REVISION)).toBe(true);
  });

  it('memoizes an observed receipt and never spends a second provider call', async () => {
    const controller = new AdkRuntimeCanaryController(SOURCE_REVISION);
    const counter = { calls: 0 };
    const dependencies = {
      providerFactory: () => matchingProvider(counter),
      nonceFactory: () => NONCE,
    };

    const first = await controller.trigger(dependencies);
    const second = await controller.trigger(dependencies);

    expect(first.status).toBe('OBSERVED');
    expect(second).toEqual(first);
    expect(counter.calls).toBe(1);
  });

  it('freezes a failed canary and never retries the provider in the same process', async () => {
    const controller = new AdkRuntimeCanaryController(SOURCE_REVISION);
    const counter = { calls: 0 };

    const first = await controller.trigger({
      providerFactory: () => ({
        models: {
          generateContent: async () => {
            counter.calls += 1;
            throw new Error('first-provider-failure');
          },
        },
      }),
      nonceFactory: () => NONCE,
    });

    const second = await controller.trigger({
      providerFactory: () => matchingProvider(counter),
      nonceFactory: () => NONCE,
    });

    expect(first.status).toBe('FAILED');
    expect(first.failureReason).toBe('adk_canary_provider_error');
    expect(second).toEqual(first);
    expect(counter.calls).toBe(1);
  });

  it('sanitizes unknown provider failures instead of leaking raw exception text', async () => {
    const controller = new AdkRuntimeCanaryController(SOURCE_REVISION);
    const result = await controller.trigger({
      providerFactory: () => ({
        models: {
          generateContent: async () => {
            throw new Error('sensitive-provider-internal-detail');
          },
        },
      }),
      nonceFactory: () => NONCE,
    });

    expect(result.status).toBe('FAILED');
    expect(result.receipt).toBeNull();
    expect(result.failureReason).toBe('adk_canary_provider_error');
    expect(JSON.stringify(result)).not.toContain('sensitive-provider-internal-detail');
  });

  it('keeps GET read-only while POST requires explicit intent and authenticated operator authority', () => {
    expect(serverSource).toContain('app.get("/api/runtime/adk-canary"');
    expect(serverSource).toContain('res.json(adkCanary.snapshot())');
    expect(serverSource).toContain('app.post("/api/runtime/adk-canary"');
    expect(serverSource).toContain('x-prooffleet-canary-intent');
    expect(serverSource).toContain('operatorSessions.authenticate(req.headers.cookie)');
    expect(serverSource).toContain('authenticated operator session required');
    expect(serverSource).toContain('adkCanary.trigger()');
    expect(serverSource).not.toContain('req.body?.operatorIdentity');
    expect(serverSource).not.toContain('req.body?.provider');
    expect(serverSource).not.toContain('req.body?.apiKey');
  });
});
