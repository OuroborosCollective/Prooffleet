/**
 * analyst.ts — rechnet echte Metriken aus dem uebergebenen Evidence-Snapshot.
 * Permissions: [read, verify]. Nichts Hardcodiertes; bei leerem Snapshot
 * ehrlich { evidenceCount: 0 }.
 */

import { AgentContext, AgentOutput, FleetAgent, requirePermission } from './base';

export interface EvidenceSnapshotEntry {
  evidenceType?: string;
  claim?: string;
  createdBy?: string;
  [key: string]: unknown;
}

export interface AnalystMetrics {
  evidenceCount: number;
  byType: Record<string, number>;
  byProducer: Record<string, number>;
  distinctTypes: number;
}

/** Reine Auswertung eines Snapshots — keine erfundenen Werte. */
export function computeMetrics(snapshot: EvidenceSnapshotEntry[]): AnalystMetrics {
  const byType: Record<string, number> = {};
  const byProducer: Record<string, number> = {};
  for (const entry of snapshot) {
    const type = typeof entry.evidenceType === 'string' && entry.evidenceType.length > 0 ? entry.evidenceType : 'unknown';
    byType[type] = (byType[type] ?? 0) + 1;
    const producer = typeof entry.createdBy === 'string' && entry.createdBy.length > 0 ? entry.createdBy : 'unknown';
    byProducer[producer] = (byProducer[producer] ?? 0) + 1;
  }
  return {
    evidenceCount: snapshot.length,
    byType,
    byProducer,
    distinctTypes: Object.keys(byType).length,
  };
}

export function createAnalystAgent(): FleetAgent {
  const agent: FleetAgent = {
    role: 'analyst',
    permissions: ['read', 'verify'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      if (ctx.requestConsent) {
        requirePermission(agent, 'consent_gate');
      }

      // Snapshot kommt aus dem Context (memory oder vom Runner abgelegt) — niemals erfunden.
      const raw = ctx.memory.get('evidenceSnapshot');
      const snapshot: EvidenceSnapshotEntry[] = Array.isArray(raw) ? (raw as EvidenceSnapshotEntry[]) : [];
      const sourceAvailable = Array.isArray(raw);

      const metrics = computeMetrics(snapshot);

      const evidenceId = ctx.emitEvidence('evidence metrics computed', 'analysis_metrics', {
        ...metrics,
        snapshotSourceAvailable: sourceAvailable,
      });

      return {
        role: agent.role,
        summary: sourceAvailable
          ? `Evidence-Snapshot ausgewertet: ${metrics.evidenceCount} Eintraege, ${metrics.distinctTypes} Typen.`
          : 'Kein Evidence-Snapshot uebergeben — ehrlich 0 Eintraege gemeldet.',
        evidenceIds: [evidenceId],
        findings: {
          ...metrics,
          ...(sourceAvailable ? {} : { note: 'no evidence snapshot provided in context' }),
        },
      };
    },
  };
  return agent;
}

export const analystAgent: FleetAgent = createAnalystAgent();
