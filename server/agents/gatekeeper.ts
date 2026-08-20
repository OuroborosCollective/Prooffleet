/**
 * gatekeeper.ts — einzige Rolle mit 'consent_gate'.
 * Erstellt einen Consent-Request fuer eine konkrete OperationSpec und wartet
 * NICHT selbst: meldet { consentRequestId, status: 'PENDING' } zurueck.
 * Niemals Auto-Approve, niemals Timeout-Approve.
 */

import { AgentContext, AgentOutput, FleetAgent, requirePermission } from './base';
import { canonicalJson, sha256Hex } from '../evidence/canonicalJson';

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

/**
 * Baut die eine mutierende Demo-Operation deterministisch auf Firestore.
 * Der rohe Missionsinhalt wird NICHT in die Operation oder Firestore-Evidence
 * kopiert; gebunden wird nur sein SHA-256 plus Revision.
 */
export function deriveOperationSpec(
  ctx: AgentContext,
  collection = process.env.PROOFFLEET_FIRESTORE_COLLECTION?.trim() || 'NOT_PROVISIONED',
): GatekeeperOperationSpec {
  const actionName = 'record_mission_proof';
  const targetResource = `firestore:${collection}`;
  const parameters = {
    goalHash: sha256Hex(ctx.inputGoal),
    missionRevision: ctx.missionRevision,
  };
  const parametersHash = sha256Hex(canonicalJson(parameters));
  const operationId = `op-${sha256Hex(
    canonicalJson({
      missionId: ctx.missionId,
      missionRevision: ctx.missionRevision,
      actionName,
      targetResource,
      parametersHash,
    }),
  ).slice(0, 20)}`;

  return {
    operationId,
    kind: 'write',
    actionName,
    targetResource,
    parameters,
    parametersHash,
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
        throw new Error('context_violation: gatekeeper requires ctx.requestConsent but it is missing');
      }

      const spec = deriveOperationSpec(ctx);
      const consentRequestId = ctx.requestConsent(spec);

      const evidenceId = ctx.emitEvidence('consent requested', 'consent_request', {
        consentRequestId,
        operationId: spec.operationId,
        kind: spec.kind,
        actionName: spec.actionName,
        targetResource: spec.targetResource,
        parametersHash: spec.parametersHash,
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
