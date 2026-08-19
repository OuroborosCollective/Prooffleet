/**
 * scout.ts — externe Einordnung des Missionsziels.
 * Permissions: [read, verify].
 * EHRLICHKEIT: Ohne konfiguriertes Grounding-Tool/LLM liefert der Scout
 * { grounded: false } — niemals erfundene Fakten oder hartcodierte Zitate.
 */

import {
  AgentContext,
  AgentOutput,
  FleetAgent,
  LlmProvider,
  requirePermission,
} from './base';

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
          reason: 'no external grounding tool configured',
        });
        return {
          role: agent.role,
          summary: 'Keine externe Einordnung moeglich: kein Grounding-Tool konfiguriert.',
          evidenceIds: [evidenceId],
          findings: { grounded: false, reason: 'no external grounding tool configured' },
        };
      }

      // Echte Quellen nur aus einem echten Tool-Aufruf.
      let citations: Array<{ title: string; url: string; snippet: string }> = [];
      let source: 'grounding_tool' | 'llm' | 'none' = 'none';
      if (grounding) {
        citations = await grounding.search(ctx.inputGoal);
        source = 'grounding_tool';
      } else if (llm) {
        // LLM-Text ist KEINE verifizierte Quelle — wird als solche markiert, keine Citations.
        await llm.generate(`Fasse das Thema ein: ${ctx.inputGoal}`);
        source = 'llm';
      }

      const evidenceId = ctx.emitEvidence('external grounding snapshot', 'grounding_snapshot', {
        grounded: citations.length > 0,
        source,
        citationCount: citations.length,
        citations, // leer, wenn keine echten Treffer — keine Erfindung
      });

      return {
        role: agent.role,
        summary:
          citations.length > 0
            ? `Externe Einordnung: ${citations.length} echte Quellen gefunden.`
            : 'Grounding-Tool konfiguriert, aber keine Treffer — keine Quellen behauptet.',
        evidenceIds: [evidenceId],
        findings: { grounded: citations.length > 0, source, citations },
      };
    },
  };
  return agent;
}

export const scoutAgent: FleetAgent = createScoutAgent();
