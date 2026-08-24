import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleAgentSearchEvidenceProvider,
  agentSearchSearchUrl,
  createGoogleAgentSearchProviderFromEnv,
  parseAgentSearchServingConfig,
  type AgentSearchFetch,
} from '../server/evidence/googleAgentSearchProvider';

const PROJECT_ID = 'project-b29d4703-a302-4b05-b2e';
const SERVING_CONFIG =
  `projects/${PROJECT_ID}/locations/global/collections/default_collection/` +
  'dataStores/proofleet-engineering-evidence/servingConfigs/default_search';

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(payload);
    },
  };
}

describe('Google Agent Search provider adapter', () => {
  it('parses only exact serving-config resources and binds them to the expected project', () => {
    const parsed = parseAgentSearchServingConfig(SERVING_CONFIG, PROJECT_ID);
    expect(parsed).toMatchObject({
      projectId: PROJECT_ID,
      location: 'global',
      collectionId: 'default_collection',
      dataStoreId: 'proofleet-engineering-evidence',
      servingConfigId: 'default_search',
      endpoint: 'discoveryengine.googleapis.com',
    });
    expect(agentSearchSearchUrl(parsed)).toBe(
      `https://discoveryengine.googleapis.com/v1/${SERVING_CONFIG}:search`,
    );

    expect(() =>
      parseAgentSearchServingConfig(SERVING_CONFIG, 'another-project-12345'),
    ).toThrow('agent_search_serving_config_project_mismatch');
    expect(() =>
      parseAgentSearchServingConfig('https://evil.example/search', PROJECT_ID),
    ).toThrow('agent_search_serving_config_invalid');
  });

  it('derives the documented regional discoveryengine endpoint without accepting arbitrary hosts', () => {
    const regional = SERVING_CONFIG.replace('/locations/global/', '/locations/europe-west1/');
    const parsed = parseAgentSearchServingConfig(regional, PROJECT_ID);
    expect(parsed.endpoint).toBe('europe-west1-discoveryengine.googleapis.com');
    expect(agentSearchSearchUrl(parsed)).toMatch(
      /^https:\/\/europe-west1-discoveryengine\.googleapis\.com\/v1\/projects\//,
    );
  });

  it('remains NOT_CONFIGURED unless explicitly enabled with target identity and dependencies', async () => {
    const token = vi.fn(async () => 'should-not-be-read');
    const fetch = vi.fn() as unknown as AgentSearchFetch;

    const disabled = createGoogleAgentSearchProviderFromEnv(
      {
        PROOFFLEET_AGENT_SEARCH_ENABLED: 'false',
        PROOFFLEET_AGENT_SEARCH_SERVING_CONFIG: SERVING_CONFIG,
        PROOFFLEET_AGENT_SEARCH_PROJECT_ID: PROJECT_ID,
      },
      { getAccessToken: token, fetch },
    );
    expect(await disabled.status()).toMatchObject({ configured: false });
    expect(token).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    const incomplete = createGoogleAgentSearchProviderFromEnv({
      PROOFFLEET_AGENT_SEARCH_ENABLED: 'true',
    });
    expect(await incomplete.status()).toMatchObject({ configured: false });
  });

  it('status is a local readiness check and performs no OAuth or network request', async () => {
    const token = vi.fn(async () => 'token');
    const fetch = vi.fn() as unknown as AgentSearchFetch;
    const provider = new GoogleAgentSearchEvidenceProvider(
      { servingConfig: SERVING_CONFIG, expectedProjectId: PROJECT_ID },
      { getAccessToken: token, fetch },
    );

    const status = await provider.status();
    expect(status.configured).toBe(true);
    expect(status.detail).toContain('no provider request was performed');
    expect(token).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('performs exactly one OAuth-protected v1 chunk search with a hard five-result cap and no pagination', async () => {
    const calls: Array<{ url: string; init: Parameters<AgentSearchFetch>[1] }> = [];
    const fetch: AgentSearchFetch = async (url, init) => {
      calls.push({ url, init });
      return response({
        results: [
          {
            chunk: {
              name: `projects/${PROJECT_ID}/locations/global/collections/default_collection/dataStores/proofleet-engineering-evidence/branches/0/documents/doc-1/chunks/chunk-7`,
              id: 'chunk-7',
              content: 'raw provider chunk text that must not be in the durable observation identity',
              documentMetadata: {
                document: `projects/${PROJECT_ID}/locations/global/collections/default_collection/dataStores/proofleet-engineering-evidence/branches/0/documents/doc-1`,
                uri: 'gs://proofleet-evidence/docs/architecture.md',
                title: 'Architecture',
              },
            },
          },
        ],
        nextPageToken: 'must-not-be-followed',
      });
    };
    const token = vi.fn(async () => 'short-lived-oauth-token');
    const provider = new GoogleAgentSearchEvidenceProvider(
      { servingConfig: SERVING_CONFIG, expectedProjectId: PROJECT_ID },
      { getAccessToken: token, fetch },
    );

    const observed = await provider.retrieve({
      missionId: 'mission-agent-search',
      sourceRevision: 'a'.repeat(40),
      query: 'operator self certification evidence',
    });

    expect(token).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      `https://discoveryengine.googleapis.com/v1/${SERVING_CONFIG}:search`,
    );
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer short-lived-oauth-token');
    const body = JSON.parse(calls[0].init.body);
    expect(body).toEqual({
      query: 'operator self certification evidence',
      pageSize: 5,
      contentSearchSpec: {
        searchResultMode: 'CHUNKS',
        chunkSpec: {
          numPreviousChunks: 0,
          numNextChunks: 0,
        },
      },
    });
    expect(body).not.toHaveProperty('pageToken');
    expect(body).not.toHaveProperty('summarySpec');

    expect(observed.sources).toEqual([
      {
        sourceReference: 'gs://proofleet-evidence/docs/architecture.md',
        documentId: `projects/${PROJECT_ID}/locations/global/collections/default_collection/dataStores/proofleet-engineering-evidence/branches/0/documents/doc-1`,
        chunkId: `projects/${PROJECT_ID}/locations/global/collections/default_collection/dataStores/proofleet-engineering-evidence/branches/0/documents/doc-1/chunks/chunk-7`,
        rank: 1,
      },
    ]);
    expect(JSON.stringify(observed)).not.toContain('short-lived-oauth-token');
    expect(JSON.stringify(observed)).not.toContain('raw provider chunk text');
  });

  it('fails closed when results are not chunk-grounded or when the provider request fails', async () => {
    const noChunkProvider = new GoogleAgentSearchEvidenceProvider(
      { servingConfig: SERVING_CONFIG, expectedProjectId: PROJECT_ID },
      {
        getAccessToken: async () => 'token',
        fetch: async () => response({ results: [{ document: { id: 'doc' } }] }),
      },
    );
    await expect(
      noChunkProvider.retrieve({
        missionId: 'mission',
        sourceRevision: 'b'.repeat(40),
        query: 'q',
      }),
    ).rejects.toThrow('agent_search_request_failed');

    const failedProvider = new GoogleAgentSearchEvidenceProvider(
      { servingConfig: SERVING_CONFIG, expectedProjectId: PROJECT_ID },
      {
        getAccessToken: async () => 'token',
        fetch: async () => response({ error: 'sensitive upstream detail' }, 500),
      },
    );
    await expect(
      failedProvider.retrieve({
        missionId: 'mission',
        sourceRevision: 'c'.repeat(40),
        query: 'q',
      }),
    ).rejects.toThrow('agent_search_request_failed');
  });

  it('caps page size at five and cannot be configured into bulk retrieval', () => {
    expect(
      () =>
        new GoogleAgentSearchEvidenceProvider(
          { servingConfig: SERVING_CONFIG, expectedProjectId: PROJECT_ID, pageSize: 6 },
          { getAccessToken: async () => 'token', fetch: async () => response({}) },
        ),
    ).toThrow('agent_search_page_size_out_of_bounds');
  });

  it('contains no API-key searchLite path or automatic pagination primitive', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      join(here, '../server/evidence/googleAgentSearchProvider.ts'),
      'utf8',
    );
    expect(source).not.toContain('searchLite');
    expect(source).not.toContain('apiKey');
    expect(source).not.toContain('key=');
    expect(source).not.toContain('autoPaginate');
    expect(source).not.toContain('nextPageToken');
    expect(source).toContain("searchResultMode: 'CHUNKS'");
  });
});
