/**
 * scout.ts — externe Einordnung des Missionsziels.
 * Permissions: [read, verify].
 * EHRLICHKEIT: Nur echte Tool-Treffer duerfen grounded=true/Citations erzeugen.
 * Gemini-Kontext bleibt ausdruecklich ungrounded AGENT_OUTPUT.
 */

import {
  AgentContext,
  AgentOutput,
  FleetAgent,
  LlmProvider,
  requirePermission,
} from './base';
import { sha256Hex } from '../evidence/canonicalJson';

export interface GroundingTool {
  search(query: string): Promise<Array<{ title: string; url: string; snippet: string }>>;
}

export function createScoutAgent(deps?: { grounding?: GroundingTool; llm?: LlmProvider }): FleetAgent {
  const agent: FleetAgent = {
    role: 'scout',
    permissions: ['read', 'verify'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      if (ctx.requestConsent) {
        requirePermission(agent, 'consent_gate');
      }

      const grounding = deps?.grounding;
      const llm = deps?.llm;

      if (!grounding && !llm) {
        const evidenceId = ctx.emitEvidence('external grounding unavailable', 'grounding_status', {
          grounded: false,
          reason: 'no external grounding tool or llm configured',
          evidenceSourceKind: 'AGENT_OUTPUT',
        });
        return {
          role: agent.role,
          summary: 'Keine externe Einordnung moeglich: weder Grounding-Tool noch Gemini-Provider konfiguriert.',
          evidenceIds: [evidenceId],
          findings: { grounded: false, reason: 'no external grounding tool or llm configured' },
        };
      }

      let citations: Array<{ title: string; url: string; snippet: string }> = [];
      let source: 'grounding_tool' | 'llm' | 'none' = 'none';
      let llmContext: string | null = null;

      if (grounding) {
        citations = await grounding.search(ctx.inputGoal);
        source = 'grounding_tool';
      } else if (llm) {
        llmContext = await llm.generate(
          `Provide concise context for this mission goal. Do not claim external grounding or citations: ${ctx.inputGoal}`,
        );
        source = 'llm';
      }

      const llmOutputSha256 = llmContext === null ? null : sha256Hex(llmContext);
      const evidenceId = ctx.emitEvidence('external grounding snapshot', 'grounding_snapshot', {
        grounded: citations.length > 0,
        source,
        citationCount: citations.length,
        citations,
        llmProvider: source === 'llm' ? llm?.providerName ?? null : null,
        llmModel: source === 'llm' ? llm?.modelId ?? null : null,
        llmOutputSha256,
        evidenceSourceKind: source === 'grounding_tool' ? 'API_READBACK' : 'AGENT_OUTPUT',
      });

      const summary = citations.length > 0
        ? `Externe Einordnung: ${citations.length} echte Quellen gefunden.`
        : source === 'llm'
          ? `[UNGROUNDED GEMINI CONTEXT] ${llmContext ?? ''}`
          : 'Grounding-Tool konfiguriert, aber keine Treffer — keine Quellen behauptet.';

      return {
        role: agent.role,
        summary,
        evidenceIds: [evidenceId],
        findings: {
          grounded: citations.length > 0,
          source,
          citations,
          llmProvider: source === 'llm' ? llm?.providerName ?? null : null,
          llmModel: source === 'llm' ? llm?.modelId ?? null : null,
          llmOutputSha256,
        },
      };
    },
  };
  return agent;
}

export const scoutAgent: FleetAgent = createScoutAgent();
