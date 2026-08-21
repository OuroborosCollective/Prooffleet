import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GROUNDING_BILLING_CANARY_CONFIRMATION,
  createGroundingBillingCanaryController,
} from '../server/evidence/groundingBillingCanaryController';
import { MockAgentSearchEvidenceProvider } from './fixtures/mockAgentSearchProvider';

const SOURCE_SHA = 'd'.repeat(40);
const QUERY = {
  missionId: 'mission-grounding-billing-canary',
  sourceRevision: SOURCE_SHA,
  query: 'Which evidence proves the operator cannot self-certify?',
};
const OBSERVATION = {
  sources: [
    {
      sourceReference: 'gs://proofleet-evidence/docs/architecture.md',
      documentId: 'doc-1',
      chunkId: 'chunk-1',
      rank: 1,
    },
  ],
  observedAt: '2026-08-21T04:00:00.000Z',
};

function armedEnv() {
  return {
    PROOFFLEET_GROUNDING_BILLING_CANARY_CONFIRMATION:
      GROUNDING_BILLING_CANARY_CONFIRMATION,
  };
}

describe('Grounding billing canary budget gate', () => {
  it('is disabled by default and spends zero provider requests', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      OBSERVATION,
    );
    const controller = createGroundingBillingCanaryController(SOURCE_SHA, provider, {});

    expect(controller.snapshot()).toMatchObject({
      state: 'DISABLED',
      armed: false,
      eligible: false,
      maxProviderRequests: 1,
      providerRequestsUsed: 0,
    });
    await controller.trigger(QUERY);
    expect(provider.retrieveCalls).toBe(0);
  });

  it('requires an exact source revision before any provider status or retrieval can matter', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      OBSERVATION,
    );
    const controller = createGroundingBillingCanaryController('main', provider, armedEnv());
    const snapshot = await controller.trigger({ ...QUERY, sourceRevision: 'main' });

    expect(snapshot.state).toBe('INELIGIBLE_SOURCE');
    expect(snapshot.providerRequestsUsed).toBe(0);
    expect(provider.retrieveCalls).toBe(0);
  });

  it('does not spend the single request when the provider is still NOT_CONFIGURED', async () => {
    const provider = new MockAgentSearchEvidenceProvider({
      configured: false,
      detail: 'not configured',
    });
    const controller = createGroundingBillingCanaryController(SOURCE_SHA, provider, armedEnv());
    const snapshot = await controller.trigger(QUERY);

    expect(snapshot).toMatchObject({
      state: 'NOT_CONFIGURED',
      providerRequestsUsed: 0,
      failureReason: 'grounding_provider_not_configured',
    });
    expect(provider.retrieveCalls).toBe(0);
  });

  it('allows exactly one successful provider retrieval and memoizes the observed receipt', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      OBSERVATION,
    );
    const controller = createGroundingBillingCanaryController(SOURCE_SHA, provider, armedEnv());

    const first = await controller.trigger(QUERY);
    const second = await controller.trigger(QUERY);

    expect(first.state).toBe('OBSERVED');
    expect(first.providerRequestsUsed).toBe(1);
    expect(first.receipt?.outcome).toBe('GROUNDING_OBSERVED');
    expect(second.receipt?.receiptSha256).toBe(first.receipt?.receiptSha256);
    expect(provider.retrieveCalls).toBe(1);
  });

  it('deduplicates concurrent triggers into the same single provider attempt', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      OBSERVATION,
    );
    const controller = createGroundingBillingCanaryController(SOURCE_SHA, provider, armedEnv());

    const results = await Promise.all(
      Array.from({ length: 25 }, () => controller.trigger(QUERY)),
    );

    expect(results.every((snapshot) => snapshot.state === 'OBSERVED')).toBe(true);
    expect(results.every((snapshot) => snapshot.providerRequestsUsed === 1)).toBe(true);
    expect(provider.retrieveCalls).toBe(1);
  });

  it('burns the one-request budget on a provider failure and never retries automatically', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      undefined,
      new Error('upstream sensitive failure'),
    );
    const controller = createGroundingBillingCanaryController(SOURCE_SHA, provider, armedEnv());

    const first = await controller.trigger(QUERY);
    const second = await controller.trigger(QUERY);

    expect(first).toMatchObject({
      state: 'SPENT_FAILED',
      providerRequestsUsed: 1,
      failureReason: 'grounding_billing_canary_provider_error',
    });
    expect(second.state).toBe('SPENT_FAILED');
    expect(provider.retrieveCalls).toBe(1);
    expect(JSON.stringify(first)).not.toContain('upstream sensitive failure');
  });

  it('blocks mismatched mission input before spending the request budget', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      OBSERVATION,
    );
    const controller = createGroundingBillingCanaryController(SOURCE_SHA, provider, armedEnv());
    const snapshot = await controller.trigger({
      ...QUERY,
      sourceRevision: 'e'.repeat(40),
    });

    expect(snapshot).toMatchObject({
      state: 'BLOCKED',
      providerRequestsUsed: 0,
      failureReason: 'grounding_billing_canary_input_mismatch',
    });
    expect(provider.retrieveCalls).toBe(0);
  });

  it('is not imported by the production server and therefore cannot incur live usage yet', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const server = readFileSync(join(here, '../server.ts'), 'utf8');
    expect(server).not.toContain('GroundingBillingCanaryController');
    expect(server).not.toContain('GROUNDING_BILLING_CANARY_CONFIRMATION');
    expect(server).not.toContain('PROOFFLEET_GROUNDING_BILLING_CANARY_CONFIRMATION');
  });
});
