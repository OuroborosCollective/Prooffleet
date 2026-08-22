import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FLEET_AGENTS } from '../server/contracts';
import {
  FALLBACK_MARKER,
  generateHonest,
  type AgentContext,
  type LlmProvider,
} from '../server/agents/base';
import { createOrchestratorAgent } from '../server/agents/orchestrator';
import { createScoutAgent } from '../server/agents/scout';
import {
  getGenAI,
  getGeminiApiKey,
  PROOFFLEET_GEMINI_MODEL,
  PROOFFLEET_GEMINI_PROVIDER,
} from '../server/gemini';
import { sha256Hex } from '../server/evidence/canonicalJson';

const here = dirname(fileURLToPath(import.meta.url));
const fleetRunnerSource = readFileSync(join(here, '../server/fleetRunner.ts'), 'utf8');
const geminiSource = readFileSync(join(here, '../server/gemini.ts'), 'utf8');
const contractsSource = readFileSync(join(here, '../server/contracts.ts'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

function context() {
  const memory = new Map<string, unknown>();
  const evidence: Array<{ claim: string; evidenceType: string; payload: Record<string, unknown> }> = [];
  const ctx: AgentContext = {
    missionId: 'mission-gemini-truth',
    missionRevision: 1,
    inputGoal: 'Verify a bounded operation without inventing external truth.',
    memory: {
      get: (key) => memory.get(key),
      set: (key, value) => memory.set(key, value),
    },
    emitEvidence: (claim, evidenceType, payload) => {
      evidence.push({ claim, evidenceType, payload });
      return `evidence-${evidence.length}`;
    },
    logger: () => {},
  };
  return { ctx, evidence };
}

function fakeGemini(output = 'bounded model response'): LlmProvider {
  return {
    providerName: PROOFFLEET_GEMINI_PROVIDER,
    modelId: PROOFFLEET_GEMINI_MODEL,
    generate: async () => output,
  };
}

describe('Gemini, Google ADK and manifest truth contract', () => {
  it('uses Gemini 3.7 Flash through Google ADK and contains no stale direct GenAI execution path', () => {
    expect(PROOFFLEET_GEMINI_PROVIDER).toBe('google-adk');
    expect(PROOFFLEET_GEMINI_MODEL).toBe('gemini-3.7-flash');
    expect(packageJson.dependencies?.['@google/adk']).toBe('^1.6.0');

    expect(fleetRunnerSource).not.toContain('gemini-3.6');
    expect(contractsSource).not.toContain('gemini-3.6');
    expect(fleetRunnerSource).toContain('model: PROOFFLEET_GEMINI_MODEL');

    expect(geminiSource).toContain('new LlmAgent({');
    expect(geminiSource).toContain('new InMemorySessionService()');
    expect(geminiSource).toContain('new Runner({');
    expect(geminiSource).toContain('runner.runAsync({');
    expect(geminiSource).toContain('role: "user"');
    expect(geminiSource).toContain('isFinalResponse(event)');
    expect(geminiSource).toContain('google_adk_no_final_response');
    expect(geminiSource).not.toContain('new GoogleGenAI');
  });

  it('pins patched high/critical ADK transitives instead of weakening the audit gate', () => {
    expect(packageJson.overrides).toEqual({
      'adm-zip': '0.6.0',
      tar: '7.5.22',
    });
  });

  it('keeps ADK tool-less and outside execution, consent, evidence and Judge authority', () => {
    expect(geminiSource).not.toContain('FunctionTool');
    expect(geminiSource).not.toContain('tools: [');
    expect(geminiSource).not.toContain('requestConsent');
    expect(geminiSource).not.toContain('Judge.judge');
    expect(geminiSource).not.toContain('emitEvidence');
    expect(geminiSource).toContain('Do not claim external actions, verification, consent, or final truth.');
  });

  it('advertises Gemini only for roles that actually receive the LLM provider', () => {
    const modelByRole = Object.fromEntries(FLEET_AGENTS.map((agent) => [agent.id, agent.model]));
    expect(modelByRole).toEqual({
      orchestrator: PROOFFLEET_GEMINI_MODEL,
      scout: PROOFFLEET_GEMINI_MODEL,
      builder: 'deterministic-runtime',
      analyst: 'deterministic-runtime',
      sentinel: 'deterministic-runtime',
      auditor: 'deterministic-runtime',
      gatekeeper: 'deterministic-runtime',
      operator: 'deterministic-runtime',
    });
  });

  it('keeps manifest IDs and permissions aligned with the enforced eight-role fleet', () => {
    expect(FLEET_AGENTS.map((agent) => agent.id)).toEqual([
      'orchestrator',
      'scout',
      'builder',
      'analyst',
      'sentinel',
      'auditor',
      'gatekeeper',
      'operator',
    ]);
    expect(Object.fromEntries(FLEET_AGENTS.map((agent) => [agent.id, agent.permissions]))).toEqual({
      orchestrator: ['read', 'verify'],
      scout: ['read', 'verify'],
      builder: ['read', 'write', 'execute'],
      analyst: ['read', 'verify'],
      sentinel: ['read', 'verify'],
      auditor: ['read', 'verify'],
      gatekeeper: ['read', 'consent_gate'],
      operator: ['read', 'write', 'execute'],
    });
  });

  it('does not assign final verdict or confidence-score authority to non-Judge roles', () => {
    const text = FLEET_AGENTS.map((agent) => `${agent.id}: ${agent.description}`).join('\n').toLowerCase();
    expect(text).not.toContain('synthesizes final truth verdicts');
    expect(text).not.toContain('truth confidence scores');
    expect(text).not.toContain('truth scoring');
  });

  it('records Orchestrator ADK/Gemini output as hashed AGENT_OUTPUT provenance', async () => {
    const modelOutput = 'Plan bounded phases and defer truth to the Judge.';
    const { ctx, evidence } = context();
    const output = await createOrchestratorAgent(fakeGemini(modelOutput)).run(ctx);

    expect(output.findings?.narrativeSource).toBe('llm');
    expect(output.findings?.llmProvider).toBe(PROOFFLEET_GEMINI_PROVIDER);
    expect(output.findings?.llmModel).toBe(PROOFFLEET_GEMINI_MODEL);
    expect(output.findings?.narrativeSha256).toBe(sha256Hex(modelOutput));
    expect(evidence).toHaveLength(1);
    expect(evidence[0].payload.evidenceSourceKind).toBe('AGENT_OUTPUT');
    expect(evidence[0].payload.llmModel).toBe(PROOFFLEET_GEMINI_MODEL);
    expect(evidence[0].payload.narrativeSha256).toBe(sha256Hex(modelOutput));
  });

  it('keeps Scout ADK/Gemini-only context ungrounded with no invented citations', async () => {
    const modelOutput = 'Context only; no external sources were queried.';
    const { ctx, evidence } = context();
    const output = await createScoutAgent({ llm: fakeGemini(modelOutput) }).run(ctx);

    expect(output.summary).toContain('[UNGROUNDED GEMINI CONTEXT]');
    expect(output.findings?.grounded).toBe(false);
    expect(output.findings?.citations).toEqual([]);
    expect(output.findings?.llmProvider).toBe(PROOFFLEET_GEMINI_PROVIDER);
    expect(output.findings?.llmModel).toBe(PROOFFLEET_GEMINI_MODEL);
    expect(output.findings?.llmOutputSha256).toBe(sha256Hex(modelOutput));
    expect(evidence[0].payload.grounded).toBe(false);
    expect(evidence[0].payload.citations).toEqual([]);
    expect(evidence[0].payload.evidenceSourceKind).toBe('AGENT_OUTPUT');
  });

  it('marks missing-provider output as deterministic fallback and propagates real provider failures', async () => {
    const fallback = await generateHonest(undefined, 'prompt', 'fallback text');
    expect(fallback).toEqual({
      text: 'fallback text',
      source: FALLBACK_MARKER,
      providerName: null,
      modelId: null,
    });

    await expect(generateHonest({
      providerName: PROOFFLEET_GEMINI_PROVIDER,
      modelId: PROOFFLEET_GEMINI_MODEL,
      generate: async () => { throw new Error('provider unavailable'); },
    }, 'prompt', 'must not be used')).rejects.toThrow('provider unavailable');
  });

  it('fails closed when GOOGLE_API_KEY and legacy GEMINI_API_KEY disagree', () => {
    const previousGoogle = process.env.GOOGLE_API_KEY;
    const previousGemini = process.env.GEMINI_API_KEY;
    try {
      process.env.GOOGLE_API_KEY = 'test-google-key';
      process.env.GEMINI_API_KEY = 'test-legacy-key';
      expect(() => getGeminiApiKey()).toThrow('gemini_api_key_conflict');
    } finally {
      if (previousGoogle === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previousGoogle;
      if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousGemini;
    }
  });

  it('accepts the legacy AI Studio key alias only when it is unambiguous', () => {
    const previousGoogle = process.env.GOOGLE_API_KEY;
    const previousGemini = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'test-legacy-key';
      expect(getGeminiApiKey()).toBe('test-legacy-key');
    } finally {
      if (previousGoogle === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previousGoogle;
      if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousGemini;
    }
  });

  it('constructs the real ADK reasoning runner without a network call', () => {
    const previousGoogle = process.env.GOOGLE_API_KEY;
    const previousGemini = process.env.GEMINI_API_KEY;
    try {
      process.env.GOOGLE_API_KEY = 'test-same-key';
      process.env.GEMINI_API_KEY = 'test-same-key';
      const provider = getGenAI();
      expect(provider).not.toBeNull();
      expect(typeof provider?.models.generateContent).toBe('function');
    } finally {
      if (previousGoogle === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previousGoogle;
      if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousGemini;
    }
  });
});
