import { describe, expect, it } from 'vitest';
import { Judge } from '../server/evidence/judge';
import {
  buildGroundingReceipt,
  collectGroundingEvidence,
  createUnconfiguredAgentSearchEvidenceProvider,
  groundingStatusSnapshot,
  verifyGroundingReceiptIntegrity,
} from '../server/evidence/grounding';
import { MockAgentSearchEvidenceProvider } from './fixtures/mockAgentSearchProvider';

const SOURCE_SHA = 'a'.repeat(40);

const input = {
  missionId: 'mission-grounding-001',
  sourceRevision: SOURCE_SHA,
  query: 'Which evidence shows the operator cannot self-certify?',
};

const observation = {
  sources: [
    {
      sourceReference: 'docs/architecture/prooffleet-architecture.mmd#operator',
      documentId: 'architecture-doc',
      chunkId: 'operator-boundary',
      rank: 1,
    },
  ],
  generatedResponse: 'The operator executes approved effects but does not issue the final Judge verdict.',
  citationCount: 1,
  observedAt: '2026-08-21T00:00:00.000Z',
};

describe('Grounding evidence contract', () => {
  it('fails closed as NOT_CONFIGURED without making a provider retrieval call', async () => {
    const provider = createUnconfiguredAgentSearchEvidenceProvider();
    const status = await groundingStatusSnapshot(provider);
    const collected = await collectGroundingEvidence(provider, input);

    expect(status).toMatchObject({
      provider: 'google-agent-search',
      state: 'NOT_CONFIGURED',
      configured: false,
    });
    expect(collected.state).toBe('NOT_CONFIGURED');
    expect(collected.receipt).toBeUndefined();
  });

  it('hashes raw query, source identifiers and generated text out of the durable receipt', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'test provider ready' },
      observation,
    );

    const collected = await collectGroundingEvidence(provider, input);
    expect(collected.state).toBe('OBSERVED');
    expect(provider.retrieveCalls).toBe(1);
    expect(collected.receipt).toBeDefined();

    const receiptJson = JSON.stringify(collected.receipt);
    expect(receiptJson).not.toContain(input.query);
    expect(receiptJson).not.toContain(observation.sources[0].sourceReference);
    expect(receiptJson).not.toContain(observation.sources[0].documentId);
    expect(receiptJson).not.toContain(observation.sources[0].chunkId);
    expect(receiptJson).not.toContain(observation.generatedResponse);
    expect(receiptJson).not.toContain('verdict');

    expect(collected.receipt?.provider).toBe('google-agent-search');
    expect(collected.receipt?.retrievalMode).toBe('OWN_DATA');
    expect(collected.receipt?.evidenceSourceKind).toBe('AGENT_SEARCH_READBACK');
    expect(collected.receipt?.sources).toHaveLength(1);
    expect(collected.receipt?.citationCount).toBe(1);
    expect(collected.receipt?.generationObserved).toBe(true);
  });

  it('independently recomputes receipt integrity and detects tampering', () => {
    const receipt = buildGroundingReceipt(input, observation);
    expect(verifyGroundingReceiptIntegrity(receipt)).toEqual({
      integrityValid: true,
      reason: 'grounding receipt integrity recomputes; claim truth is not implied',
    });

    const tampered = structuredClone(receipt);
    tampered.citationCount = 99;
    const verification = verifyGroundingReceiptIntegrity(tampered);
    expect(verification.integrityValid).toBe(false);
    expect(verification.reason).toContain('does not recompute');
  });

  it('rejects malformed source revisions and source-less grounding observations', () => {
    expect(() =>
      buildGroundingReceipt({ ...input, sourceRevision: 'main' }, observation),
    ).toThrow('source_revision_must_be_exact_git_sha');

    expect(() =>
      buildGroundingReceipt(input, { ...observation, sources: [] }),
    ).toThrow('grounding_requires_retrieved_source');
  });

  it('sanitizes provider failures instead of leaking upstream errors', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      undefined,
      new Error('sensitive provider diagnostic'),
    );

    const collected = await collectGroundingEvidence(provider, input);
    expect(collected).toEqual({
      provider: 'google-agent-search',
      state: 'FAILED',
      configured: true,
      detail: 'grounding_provider_error',
    });
    expect(JSON.stringify(collected)).not.toContain('sensitive provider diagnostic');
  });

  it('does not let a grounding receipt become a Judge verdict by itself', async () => {
    const provider = new MockAgentSearchEvidenceProvider(
      { configured: true, detail: 'ready' },
      observation,
    );
    const collected = await collectGroundingEvidence(provider, input);
    expect(collected.state).toBe('OBSERVED');

    const verdict = Judge.judge('operator cannot self-certify', [], []);
    expect(verdict.verdict).toBe('BLOCKED_BY_MISSING_EVIDENCE');
    expect(verdict.rationale).toContain('No evidence blocks found');
  });
});
