/**
 * operator.ts — fuehrt freigegebene Operationen aus.
 * Permissions: [read, write, execute].
 * EHRLICHKEIT: Ohne injizierten Executor bzw. ohne erteilten Consent wird
 * NICHTS ausgefuehrt — Status 'not_executed' / 'blocked_consent_required',
 * niemals ein behaupteter Erfolg.
 */

import { AgentContext, AgentOutput, FleetAgent } from './base';

export interface OperatorExecutor {
  execute(spec: unknown): Promise<{ status: string; detail?: string }>;
}

export function createOperatorAgent(executor?: OperatorExecutor): FleetAgent {
  const agent: FleetAgent = {
    role: 'operator',
    permissions: ['read', 'write', 'execute'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      // Consent-Status kommt aus dem Context (vom Gatekeeper/ConsentEngine-Flow).
      const consent = ctx.memory.get('approvedConsent');
      const spec = ctx.memory.get('pendingOperationSpec');

      if (!spec || typeof spec !== 'object') {
        const evidenceId = ctx.emitEvidence('no operation to execute', 'operation_status', {
          status: 'not_executed',
          reason: 'no operation spec provided in context',
        });
        return {
          role: agent.role,
          summary: 'Keine Operation zur Ausfuehrung uebergeben — nichts ausgefuehrt.',
          evidenceIds: [evidenceId],
          findings: { status: 'not_executed', reason: 'no operation spec provided in context' },
        };
      }

      if (!consent) {
        const evidenceId = ctx.emitEvidence('operation blocked: consent required', 'operation_status', {
          status: 'blocked_consent_required',
          operationId: (spec as { operationId?: string }).operationId ?? null,
        });
        return {
          role: agent.role,
          summary: 'Operation blockiert: kein gueltiger Consent-Grant vorhanden.',
          evidenceIds: [evidenceId],
          findings: { status: 'blocked_consent_required' },
        };
      }

      if (!executor) {
        const evidenceId = ctx.emitEvidence('operation not executed', 'operation_status', {
          status: 'not_executed',
          reason: 'no operation executor configured',
        });
        return {
          role: agent.role,
          summary: 'Consent vorhanden, aber kein OperationExecutor konfiguriert — ehrlich nicht ausgefuehrt.',
          evidenceIds: [evidenceId],
          findings: { status: 'not_executed', reason: 'no operation executor configured' },
        };
      }

      // Echte Ausfuehrung ueber den injizierten Executor (mit Idempotency/Readback-Semantik des OPS-Moduls).
      const result = await executor.execute(spec);
      const evidenceId = ctx.emitEvidence('operation executed via executor', 'operation_result', {
        status: result.status,
        detail: result.detail ?? null,
      });
      return {
        role: agent.role,
        summary: `Operation ausgefuehrt: status=${result.status}.`,
        evidenceIds: [evidenceId],
        findings: { status: result.status, detail: result.detail ?? null },
      };
    },
  };
  return agent;
}

export const operatorAgent: FleetAgent = createOperatorAgent();
