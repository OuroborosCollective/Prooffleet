/**
 * auditor.ts — stellt NUR Evidence bereit (Chain-Snapshot-Export).
 * Permissions: [read, verify].
 * Faellt KEIN Urteil, vergibt KEINE Scores, verifiziert NICHT die eigene Chain —
 * Urteile gehoeren ausschliesslich Judge/Verifier (server/evidence/).
 */

import { createHash } from 'node:crypto';

import { AgentContext, AgentOutput, FleetAgent, requirePermission } from './base';

export interface ChainSnapshotSummary {
  blockCount: number;
  snapshotHash: string | null; // null bei leerer Kette — ehrlich, kein Fake-Hash
  exportedAt: string;
}

export function createAuditorAgent(): FleetAgent {
  const agent: FleetAgent = {
    role: 'auditor',
    permissions: ['read', 'verify'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      if (ctx.requestConsent) {
        requirePermission(agent, 'consent_gate');
      }

      // Read-only Chain-Snapshot aus dem Context (vom Runner abgelegt). Nie selbst verifizieren.
      const raw = ctx.memory.get('chainSnapshot');
      const chain: unknown[] = Array.isArray(raw) ? raw : [];

      const summary: ChainSnapshotSummary = {
        blockCount: chain.length,
        snapshotHash:
          chain.length > 0
            ? createHash('sha256').update(JSON.stringify(chain)).digest('hex')
            : null,
        exportedAt: new Date().toISOString(),
      };

      const evidenceId = ctx.emitEvidence('chain snapshot exported', 'chain_snapshot', {
        ...summary,
        // Explizit: der Auditor faellt kein Urteil und vergibt keinen Score.
        verdict: null,
        score: null,
        note: 'Urteil und Verifikation obliegen ausschliesslich Judge/IndependentVerifier.',
      });

      return {
        role: agent.role,
        summary:
          chain.length > 0
            ? `Chain-Snapshot exportiert, ${summary.blockCount} Bloecke (hash ${summary.snapshotHash?.slice(0, 12)}...). Kein Urteil gefasst.`
            : 'Chain-Snapshot exportiert: Kette leer (0 Bloecke). Kein Urteil gefasst.',
        evidenceIds: [evidenceId],
        findings: {
          ...summary,
          judgment: 'deferred_to_judge',
        },
      };
    },
  };
  return agent;
}

export const auditorAgent: FleetAgent = createAuditorAgent();
