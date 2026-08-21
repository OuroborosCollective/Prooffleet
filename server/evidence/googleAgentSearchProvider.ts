import {
  AGENT_SEARCH_PROVIDER,
  createUnconfiguredAgentSearchEvidenceProvider,
  type AgentSearchEvidenceProvider,
  type AgentSearchObservation,
  type AgentSearchProviderStatus,
  type GroundingQuery,
  type GroundingSourceObservation,
} from './grounding';

const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 5;
const DEFAULT_API_VERSION = 'v1';
const SERVING_CONFIG_RE = /^projects\/([a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]+)\/locations\/([a-z0-9-]+)\/collections\/([A-Za-z0-9_-]{1,128})\/dataStores\/([A-Za-z0-9_-]{1,128})\/servingConfigs\/([A-Za-z0-9_-]{1,128})$/;

export interface GoogleAgentSearchConfig {
  servingConfig: string;
  expectedProjectId: string;
  pageSize?: number;
}

export interface ParsedServingConfig {
  projectId: string;
  location: string;
  collectionId: string;
  dataStoreId: string;
  servingConfigId: string;
  resourceName: string;
  endpoint: string;
}

export interface AgentSearchHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type AgentSearchFetch = (
  input: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<AgentSearchHttpResponse>;

export type AccessTokenProvider = () => Promise<string>;

export interface GoogleAgentSearchDependencies {
  getAccessToken: AccessTokenProvider;
  fetch: AgentSearchFetch;
}

export interface GoogleAgentSearchEnv {
  PROOFFLEET_AGENT_SEARCH_ENABLED?: string;
  PROOFFLEET_AGENT_SEARCH_SERVING_CONFIG?: string;
  PROOFFLEET_AGENT_SEARCH_PROJECT_ID?: string;
}

interface SearchChunk {
  name?: unknown;
  id?: unknown;
  documentMetadata?: unknown;
}

interface SearchResult {
  chunk?: unknown;
}

interface SearchResponse {
  results?: unknown;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requireProjectId(value: string): string {
  const normalized = value.trim();
  if (!/^([a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]+)$/.test(normalized)) {
    throw new Error('agent_search_expected_project_invalid');
  }
  return normalized;
}

function boundedPageSize(value?: number): number {
  const pageSize = value ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error('agent_search_page_size_out_of_bounds');
  }
  return pageSize;
}

export function parseAgentSearchServingConfig(
  servingConfig: string,
  expectedProjectId: string,
): ParsedServingConfig {
  const normalized = servingConfig.trim();
  const expectedProject = requireProjectId(expectedProjectId);
  const match = normalized.match(SERVING_CONFIG_RE);
  if (!match) throw new Error('agent_search_serving_config_invalid');

  const [, projectId, location, collectionId, dataStoreId, servingConfigId] = match;
  if (projectId !== expectedProject) {
    throw new Error('agent_search_serving_config_project_mismatch');
  }

  const endpoint =
    location === 'global'
      ? 'discoveryengine.googleapis.com'
      : `${location}-discoveryengine.googleapis.com`;

  if (
    endpoint !== 'discoveryengine.googleapis.com' &&
    !/^[a-z0-9-]+\.discoveryengine\.googleapis\.com$/.test(endpoint)
  ) {
    throw new Error('agent_search_endpoint_invalid');
  }

  return {
    projectId,
    location,
    collectionId,
    dataStoreId,
    servingConfigId,
    resourceName: normalized,
    endpoint,
  };
}

export function agentSearchSearchUrl(parsed: ParsedServingConfig): string {
  return `https://${parsed.endpoint}/${DEFAULT_API_VERSION}/${parsed.resourceName}:search`;
}

function documentResourceFromChunk(chunkName: string): string {
  const marker = '/chunks/';
  const index = chunkName.lastIndexOf(marker);
  if (index <= 0) throw new Error('agent_search_chunk_resource_invalid');
  return chunkName.slice(0, index);
}

function projectChunkResult(value: unknown, rank: number): GroundingSourceObservation {
  const result = asRecord(value) as SearchResult | null;
  const chunk = asRecord(result?.chunk) as SearchChunk | null;
  if (!chunk) throw new Error('agent_search_chunk_result_required');

  const chunkName = nonEmptyString(chunk.name);
  if (!chunkName) throw new Error('agent_search_chunk_resource_missing');

  const documentMetadata = asRecord(chunk.documentMetadata);
  const documentResource =
    nonEmptyString(documentMetadata?.document) ?? documentResourceFromChunk(chunkName);
  const sourceReference = nonEmptyString(documentMetadata?.uri) ?? documentResource;

  return {
    sourceReference,
    documentId: documentResource,
    chunkId: chunkName,
    rank,
  };
}

function projectSearchResponse(payload: unknown, pageSize: number): AgentSearchObservation {
  const response = asRecord(payload) as SearchResponse | null;
  const results = Array.isArray(response?.results) ? response.results.slice(0, pageSize) : [];
  if (results.length === 0) throw new Error('agent_search_no_results');

  return {
    sources: results.map((result, index) => projectChunkResult(result, index + 1)),
    citationCount: 0,
    observedAt: new Date().toISOString(),
  };
}

export class GoogleAgentSearchEvidenceProvider implements AgentSearchEvidenceProvider {
  readonly provider = AGENT_SEARCH_PROVIDER;
  private readonly parsed: ParsedServingConfig;
  private readonly pageSize: number;

  constructor(
    config: GoogleAgentSearchConfig,
    private readonly dependencies: GoogleAgentSearchDependencies,
  ) {
    this.parsed = parseAgentSearchServingConfig(
      config.servingConfig,
      config.expectedProjectId,
    );
    this.pageSize = boundedPageSize(config.pageSize);
  }

  async status(): Promise<AgentSearchProviderStatus> {
    return {
      configured: true,
      detail: `Google Agent Search adapter configured for ${this.parsed.dataStoreId}; no provider request was performed.`,
    };
  }

  async retrieve(input: GroundingQuery): Promise<AgentSearchObservation> {
    const query = input.query.trim();
    if (!query) throw new Error('agent_search_query_required');

    try {
      const accessToken = (await this.dependencies.getAccessToken()).trim();
      if (!accessToken) throw new Error('agent_search_access_token_missing');

      const requestBody = JSON.stringify({
        query,
        pageSize: this.pageSize,
        contentSearchSpec: {
          searchResultMode: 'CHUNKS',
          chunkSpec: {
            numPreviousChunks: 0,
            numNextChunks: 0,
          },
        },
      });

      const response = await this.dependencies.fetch(agentSearchSearchUrl(this.parsed), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      if (!response.ok) throw new Error(`agent_search_http_${response.status}`);
      return projectSearchResponse(await response.json(), this.pageSize);
    } catch {
      throw new Error('agent_search_request_failed');
    }
  }
}

export function createGoogleAgentSearchProviderFromEnv(
  env: GoogleAgentSearchEnv,
  dependencies?: GoogleAgentSearchDependencies,
): AgentSearchEvidenceProvider {
  if (env.PROOFFLEET_AGENT_SEARCH_ENABLED !== 'true') {
    return createUnconfiguredAgentSearchEvidenceProvider();
  }

  const servingConfig = env.PROOFFLEET_AGENT_SEARCH_SERVING_CONFIG?.trim() ?? '';
  const expectedProjectId = env.PROOFFLEET_AGENT_SEARCH_PROJECT_ID?.trim() ?? '';
  if (!servingConfig || !expectedProjectId || !dependencies) {
    return createUnconfiguredAgentSearchEvidenceProvider();
  }

  return new GoogleAgentSearchEvidenceProvider(
    { servingConfig, expectedProjectId, pageSize: DEFAULT_PAGE_SIZE },
    dependencies,
  );
}
