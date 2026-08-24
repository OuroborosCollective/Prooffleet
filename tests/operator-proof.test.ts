import { describe, expect, it } from 'vitest';

import { createOperatorAgent } from '../server/agents/operator';
import type { AgentContext } from '../server/agents/base';

function context(memoryValues: Record<string, unknown>) {
  const emitted: Array<{ claim: string; evidenceType: string; payload: Record<string, unknown> }> = [];
  const ctx: AgentContext = {
    missionId: 'm1',
    missionRevision: 1,
    inputGoal: 'deploy safely',
    memory: {
      get: (key) => memoryValues[key],
      set: (key, value) => { memoryValues[key] = value; },
    },
    emitEvidence: (claim, evidenceType, payload) => {
      emitted.push({ claim, evidenceType, payload });
      return `e-${emitted.length}`;
    },
    logger: () => {},
  };
  return { ctx, emitted };
}

describe('Operator proof boundary', () => {
  it('does not turn an executor success without readback provenance into OBSERVED runtime proof', async () => {
    const { ctx, emitted } = context({
      approvedConsent: { decision: 'APPROVED' },
      pendingOperationSpec: { operationId: 'op-1' },
    });
    const agent = createOperatorAgent({
      async execute() {
        return { status: 'applied' };
      },
    });

    await agent.run(ctx);

    expect(emitted.at(-1)?.payload.assertion).toBe('UNAVAILABLE');
    expect(emitted.at(-1)?.payload.sourceKind).toBe('AGENT_OUTPUT');
  });

  it('projects authoritative readback provenance only when executor supplies it', async () => {
    const { ctx, emitted } = context({
      approvedConsent: { decision: 'APPROVED' },
      pendingOperationSpec: { operationId: 'op-1' },
    });
    const agent = createOperatorAgent({
      async execute() {
        return {
          status: 'applied',
          readbackEvidence: { activeRevision: 'rev-42' },
          sourceKind: 'CLOUD_RUN_READBACK',
          deploymentRevision: 'rev-42',
        };
      },
    });

    await agent.run(ctx);

    expect(emitted.at(-1)?.payload.assertion).toBe('OBSERVED');
    expect(emitted.at(-1)?.payload.sourceKind).toBe('CLOUD_RUN_READBACK');
    expect(emitted.at(-1)?.payload.operationId).toBe('op-1');
    expect(emitted.at(-1)?.payload.deploymentRevision).toBe('rev-42');
  });
});
