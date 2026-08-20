/**
 * operator.ts — fuehrt freigegebene Operationen aus.
 * Permissions: [read, write, execute].
 * EHRLICHKEIT: Ohne injizierten Executor bzw. ohne erteilten Consent wird
 * NICHTS ausgefuehrt — Status 'not_executed' / 'blocked_consent_required',
 * niemals ein behaupteter Erfolg.
 */

import type {
  EvidenceAssertion,
  EvidenceSourceKind,
} from '../../src/types/index';
import { AgentContext, AgentOutput, FleetAgent } from './base';

export interface OperatorExecutionResult {
  status: string;
  detail?: string;
  readbackEvidence?: unknown;
  sourceKind?: EvidenceSourceKind;
  sourceRevision?: string;
  deploymentRevision?: string;
}

export interface OperatorExecutor {
  execute(spec: unknown): Promise<OperatorExecutionResult>;
}

function assertionFor(result: OperatorExecutionResult): EvidenceAssertion {
  if (result.status === 'failed') return 'CONTRADICTED';
  if (
    (result.status === 'applied' || result.status === 'already_applied') &&
    result.readbackEvidence !== undefined
  ) {
    return 'OBSERVED';
  }
  return 'UNAVAILABLE';
}

export function createOperatorAgent(executor?: OperatorExecutor): FleetAgent {
  const agent: FleetAgent = {
    role: 'operator',
    permissions: ['read', 'write', 'execute'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      const consent = ctx.memory.get('approvedConsent');
      const spec = ctx.memory.get('pendingOperationSpec');
      const operationId =
        spec && typeof spec === 'object'
          ? (spec as { operationId?: string }).operationId ?? null
          : null;

      if (!spec || typeof spec !== 'object') {
        const evidenceId = ctx.emitEvidence('no operation to execute', 'operation_status', {
          status: 'not_executed',
          assertion: 'UNAVAILABLE',
          sourceKind: 'AGENT_OUTPUT',
          operationId,
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
          assertion: 'UNAVAILABLE',
          sourceKind: 'AGENT_OUTPUT',
          operationId,
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
          assertion: 'UNAVAILABLE',
          sourceKind: 'AGENT_OUTPUT',
          operationId,
          reason: 'no operation executor configured',
        });
        return {
          role: agent.role,
          summary: 'Consent vorhanden, aber kein OperationExecutor konfiguriert — ehrlich nicht ausgefuehrt.',
          evidenceIds: [evidenceId],
          findings: { status: 'not_executed', reason: 'no operation executor configured' },
        };
      }

      const result = await executor.execute(spec);
      const assertion = assertionFor(result);
      const sourceKind = result.sourceKind ?? 'AGENT_OUTPUT';
      const evidenceId = ctx.emitEvidence('operation executed via executor', 'operation_result', {
        status: result.status,
        detail: result.detail ?? null,
        assertion,
        sourceKind,
        operationId,
        readbackEvidence: result.readbackEvidence ?? null,
        sourceRevision: result.sourceRevision ?? null,
        deploymentRevision: result.deploymentRevision ?? null,
      });
      return {
        role: agent.role,
        summary: `Operation ausgefuehrt: status=${result.status}, assertion=${assertion}, source=${sourceKind}.`,
        evidenceIds: [evidenceId],
        findings: {
          status: result.status,
          assertion,
          sourceKind,
          detail: result.detail ?? null,
        },
      };
    },
  };
  return agent;
}

export const operatorAgent: FleetAgent = createOperatorAgent();
