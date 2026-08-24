import { canonicalJson } from './canonicalJson';
import { sha256Hex } from './ledger';

export const AGENT_SEARCH_PROVIDER = 'google-agent-search' as const;
export const GROUNDING_RECEIPT_SCHEMA = 'prooffleet.grounding.v1' as const;

export type GroundingEvidenceState = 'NOT_CONFIGURED' | 'READY' | 'OBSERVED' | 'FAILED';
export type GroundingRetrievalMode = 'OWN_DATA';

export interface GroundingQuery {
  missionId: string;
  sourceRevision: string;
  query: string;
}

export interface GroundingSourceObservation {
  sourceReference: string;
  documentId: string;
  chunkId: string;
  rank: number;
}

export interface AgentSearchObservation {
  sources: GroundingSourceObservation[];
  generatedResponse?: string;
  citationCount?: number;
  observedAt?: string;
}

export interface AgentSearchProviderStatus {
  configured: boolean;
  detail: string;
}

export interface AgentSearchEvidenceProvider {
  readonly provider: typeof AGENT_SEARCH_PROVIDER;
  status(): Promise<AgentSearchProviderStatus>;
  retrieve(input: GroundingQuery): Promise<AgentSearchObservation>;
}

export interface GroundingSourceReceipt {
  sourceReferenceSha256: string;
  documentIdSha256: string;
  chunkIdSha256: string;
  rank: number;
}

export interface GroundingReceipt {
  schemaVersion: typeof GROUNDING_RECEIPT_SCHEMA;
  outcome: 'GROUNDING_OBSERVED';
  missionId: string;
  sourceRevision: string;
  provider: typeof AGENT_SEARCH_PROVIDER;
  retrievalMode: GroundingRetrievalMode;
  evidenceSourceKind: 'AGENT_SEARCH_READBACK';
  querySha256: string;
  sources: GroundingSourceReceipt[];
  generationObserved: boolean;
  generatedResponseSha256: string | null;
  citationCount: number;
  observedAt: string;
  receiptSha256: string;
}

export interface GroundingStatusSnapshot {
  provider: typeof AGENT_SEARCH_PROVIDER;
  state: GroundingEvidenceState;
  configured: boolean;
  detail: string;
  receipt?: GroundingReceipt;
}

export interface GroundingReceiptVerification {
  integrityValid: boolean;
  reason: string;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

function requireSourceRevision(value: string): string {
  const normalized = requireNonEmpty(value, 'source_revision');
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error('source_revision_must_be_exact_git_sha');
  }
  return normalized;
}

function normalizeObservedAt(value?: string): string {
  const observedAt = value ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(observedAt))) throw new Error('observed_at_invalid');
  return observedAt;
}

function hashOpaque(value: string, field: string): string {
  return sha256Hex(requireNonEmpty(value, field));
}

export function computeGroundingReceiptHash(
  receipt: Omit<GroundingReceipt, 'receiptSha256'>,
): string {
  return sha256Hex(canonicalJson(receipt));
}

export function buildGroundingReceipt(
  input: GroundingQuery,
  observation: AgentSearchObservation,
): GroundingReceipt {
  const missionId = requireNonEmpty(input.missionId, 'mission_id');
  const sourceRevision = requireSourceRevision(input.sourceRevision);
  const query = requireNonEmpty(input.query, 'query');

  if (!Array.isArray(observation.sources) || observation.sources.length === 0) {
    throw new Error('grounding_requires_retrieved_source');
  }

  const ranked = [...observation.sources]
    .map((source) => {
      if (!Number.isInteger(source.rank) || source.rank < 1) {
        throw new Error('source_rank_invalid');
      }
      return {
        sourceReferenceSha256: hashOpaque(source.sourceReference, 'source_reference'),
        documentIdSha256: hashOpaque(source.documentId, 'document_id'),
        chunkIdSha256: hashOpaque(source.chunkId, 'chunk_id'),
        rank: source.rank,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  const ranks = new Set(ranked.map((source) => source.rank));
  if (ranks.size !== ranked.length) throw new Error('source_rank_duplicate');

  const generatedResponse = observation.generatedResponse?.trim() ?? '';
  const generationObserved = generatedResponse.length > 0;
  const citationCount = observation.citationCount ?? 0;
  if (!Number.isInteger(citationCount) || citationCount < 0) {
    throw new Error('citation_count_invalid');
  }

  const unsigned: Omit<GroundingReceipt, 'receiptSha256'> = {
    schemaVersion: GROUNDING_RECEIPT_SCHEMA,
    outcome: 'GROUNDING_OBSERVED',
    missionId,
    sourceRevision,
    provider: AGENT_SEARCH_PROVIDER,
    retrievalMode: 'OWN_DATA',
    evidenceSourceKind: 'AGENT_SEARCH_READBACK',
    querySha256: sha256Hex(query),
    sources: ranked,
    generationObserved,
    generatedResponseSha256: generationObserved ? sha256Hex(generatedResponse) : null,
    citationCount,
    observedAt: normalizeObservedAt(observation.observedAt),
  };

  return {
    ...unsigned,
    receiptSha256: computeGroundingReceiptHash(unsigned),
  };
}

export function verifyGroundingReceiptIntegrity(
  receipt: GroundingReceipt,
): GroundingReceiptVerification {
  if (receipt.schemaVersion !== GROUNDING_RECEIPT_SCHEMA) {
    return { integrityValid: false, reason: 'grounding receipt schema mismatch' };
  }
  if (receipt.outcome !== 'GROUNDING_OBSERVED') {
    return { integrityValid: false, reason: 'grounding receipt outcome mismatch' };
  }
  if (receipt.provider !== AGENT_SEARCH_PROVIDER || receipt.retrievalMode !== 'OWN_DATA') {
    return { integrityValid: false, reason: 'grounding provider identity mismatch' };
  }
  if (receipt.evidenceSourceKind !== 'AGENT_SEARCH_READBACK') {
    return { integrityValid: false, reason: 'grounding source kind mismatch' };
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.sourceRevision)) {
    return { integrityValid: false, reason: 'grounding source revision malformed' };
  }
  if (!/^[0-9a-f]{64}$/.test(receipt.querySha256)) {
    return { integrityValid: false, reason: 'grounding query hash malformed' };
  }
  if (!Array.isArray(receipt.sources) || receipt.sources.length === 0) {
    return { integrityValid: false, reason: 'grounding receipt has no sources' };
  }
  if (Number.isNaN(Date.parse(receipt.observedAt))) {
    return { integrityValid: false, reason: 'grounding timestamp malformed' };
  }

  for (const source of receipt.sources) {
    if (
      !/^[0-9a-f]{64}$/.test(source.sourceReferenceSha256) ||
      !/^[0-9a-f]{64}$/.test(source.documentIdSha256) ||
      !/^[0-9a-f]{64}$/.test(source.chunkIdSha256) ||
      !Number.isInteger(source.rank) ||
      source.rank < 1
    ) {
      return { integrityValid: false, reason: 'grounding source receipt malformed' };
    }
  }

  const { receiptSha256, ...unsigned } = receipt;
  if (!/^[0-9a-f]{64}$/.test(receiptSha256)) {
    return { integrityValid: false, reason: 'grounding receipt hash malformed' };
  }
  if (computeGroundingReceiptHash(unsigned) !== receiptSha256) {
    return { integrityValid: false, reason: 'grounding receipt hash does not recompute' };
  }

  return {
    integrityValid: true,
    reason: 'grounding receipt integrity recomputes; claim truth is not implied',
  };
}

export function createUnconfiguredAgentSearchEvidenceProvider(): AgentSearchEvidenceProvider {
  return {
    provider: AGENT_SEARCH_PROVIDER,
    async status() {
      return {
        configured: false,
        detail: 'Google Agent Search is not configured; no provider call was performed.',
      };
    },
    async retrieve() {
      throw new Error('agent_search_not_configured');
    },
  };
}

export async function groundingStatusSnapshot(
  provider: AgentSearchEvidenceProvider,
): Promise<GroundingStatusSnapshot> {
  try {
    const status = await provider.status();
    return {
      provider: provider.provider,
      state: status.configured ? 'READY' : 'NOT_CONFIGURED',
      configured: status.configured,
      detail: status.detail,
    };
  } catch {
    return {
      provider: provider.provider,
      state: 'FAILED',
      configured: false,
      detail: 'grounding_status_error',
    };
  }
}

export async function collectGroundingEvidence(
  provider: AgentSearchEvidenceProvider,
  input: GroundingQuery,
): Promise<GroundingStatusSnapshot> {
  try {
    requireNonEmpty(input.missionId, 'mission_id');
    requireSourceRevision(input.sourceRevision);
    requireNonEmpty(input.query, 'query');

    const status = await provider.status();
    if (!status.configured) {
      return {
        provider: provider.provider,
        state: 'NOT_CONFIGURED',
        configured: false,
        detail: status.detail,
      };
    }

    const observation = await provider.retrieve(input);
    const receipt = buildGroundingReceipt(input, observation);
    return {
      provider: provider.provider,
      state: 'OBSERVED',
      configured: true,
      detail: 'Provider observation hashed into a grounding receipt.',
      receipt,
    };
  } catch {
    return {
      provider: provider.provider,
      state: 'FAILED',
      configured: true,
      detail: 'grounding_provider_error',
    };
  }
}
