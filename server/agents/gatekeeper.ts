/**
 * gatekeeper.ts — einzige Rolle mit 'consent_gate'.
 * Erstellt einen Consent-Request fuer eine konkrete OperationSpec und wartet
 * NICHT selbst: meldet { consentRequestId, status: 'PENDING' } zurueck.
 * Niemals Auto-Approve, niemals Timeout-Approve.
 */

import { createHash } from 'node:crypto';

import { AgentContext, AgentOutput, FleetAgent, requirePermission } from './base';

export interface GatekeeperOperationSpec {
  operationId: string;
  kind: 'read' | 'write' | 'execute';
  actionName: string;
  targetResource: string;
  parameters: Record<string, unknown>;
  parametersHash: string;
  missionId: string;
  missionRevision: number;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

/** Baut eine konkrete OperationSpec aus dem Missionsziel (deterministisch). */
export function deriveOperationSpec(ctx: AgentContext): GatekeeperOperationSpec {
  const parameters = { goal: ctx.inputGoal };
  return {
    operationId: `op-${createHash('sha256').update(`${ctx.missionId}:${ctx.missionRevision}:${ctx.inputGoal}`).digest('hex').slice(0, 16)}`,
    kind: 'execute',
    actionName: 'deploy_mission_artifacts',
    targetResource: 'mission-artifact-store',
    parameters,
    parametersHash: createHash('sha256').update(canonicalJson(parameters)).digest('hex'),
    missionId: ctx.missionId,
    missionRevision: ctx.missionRevision,
  };
}

export function createGatekeeperAgent(): FleetAgent {
  const agent: FleetAgent = {
    role: 'gatekeeper',
    permissions: ['read', 'consent_gate'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      requirePermission(agent, 'consent_gate');
      if (typeof ctx.requestConsent !== 'function') {
        throw new Error("context_violation: gatekeeper requires ctx.requestConsent but it is missing");
      }

      const spec = deriveOperationSpec(ctx);
      const consentRequestId = ctx.requestConsent(spec);

      const evidenceId = ctx.emitEvidence('consent requested', 'consent_request', {
        consentRequestId,
        operationId: spec.operationId,
        kind: spec.kind,
        actionName: spec.actionName,
        status: 'PENDING',
      });

      ctx.logger(`gatekeeper: consent request ${consentRequestId} created for op ${spec.operationId} — NOT waiting`);

      return {
        role: agent.role,
        summary: `Consent fuer Operation "${spec.actionName}" angefordert (${consentRequestId}); Status PENDING — kein Auto-Approve.`,
        evidenceIds: [evidenceId],
        findings: {
          consentRequestId,
          status: 'PENDING' as const,
          operation: spec,
        },
      };
    },
  };
  return agent;
}

export const gatekeeperAgent: FleetAgent = createGatekeeperAgent();
