/**
 * orchestrator.ts — plant die Missionsphasen und delegiert.
 * Permissions: [read, verify]. Kein write/execute, kein consent_gate.
 */

import {
  AgentContext,
  AgentOutput,
  FleetAgent,
  LlmProvider,
  generateHonest,
  requirePermission,
} from './base';
import { sha256Hex } from '../evidence/canonicalJson';

export function createOrchestratorAgent(llm?: LlmProvider): FleetAgent {
  const agent: FleetAgent = {
    role: 'orchestrator',
    permissions: ['read', 'verify'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      // Laufzeit-Guard: der Orchestrator darf kein Consent anfordern koennen.
      if (ctx.requestConsent) {
        requirePermission(agent, 'consent_gate'); // wirft immer — Context-Verletzung
      }

      const plan = [
        { phase: 'scout', purpose: 'externe Einordnung des Ziels (optional)' },
        { phase: 'builder', purpose: 'Artefakt-Spezifikation erzeugen und ehrlich pruefen' },
        { phase: 'analyst', purpose: 'Metriken ueber den Evidence-Snapshot' },
        { phase: 'sentinel', purpose: 'Sicherheits- und Permission-Scans' },
        { phase: 'auditor', purpose: 'Chain-Snapshot exportieren (kein Urteil)' },
        { phase: 'gatekeeper', purpose: 'Consent fuer destruktive Operationen anfordern' },
        { phase: 'operator', purpose: 'freigegebene Operationen ausfuehren' },
      ];

      const generated = await generateHonest(
        llm,
        `Plane eine Mission fuer: ${ctx.inputGoal}`,
        `Deterministischer Missionsplan mit ${plan.length} Phasen fuer Ziel: "${ctx.inputGoal}".`,
      );
      const narrativeSha256 = sha256Hex(generated.text);

      const evidenceId = ctx.emitEvidence('mission plan created', 'mission_plan', {
        missionId: ctx.missionId,
        missionRevision: ctx.missionRevision,
        inputGoal: ctx.inputGoal,
        phases: plan.map((p) => p.phase),
        narrativeSource: generated.source,
        llmProvider: generated.source === 'llm' ? generated.providerName : null,
        llmModel: generated.source === 'llm' ? generated.modelId : null,
        narrativeSha256,
        evidenceSourceKind: 'AGENT_OUTPUT',
      });

      ctx.memory.set('plan', plan);
      ctx.logger(`orchestrator: plan with ${plan.length} phases emitted (${evidenceId})`);

      return {
        role: agent.role,
        summary: generated.text,
        evidenceIds: [evidenceId],
        findings: {
          phases: plan,
          narrativeSource: generated.source,
          llmProvider: generated.providerName,
          llmModel: generated.modelId,
          narrativeSha256,
        },
      };
    },
  };
  return agent;
}

export const orchestratorAgent: FleetAgent = createOrchestratorAgent();
