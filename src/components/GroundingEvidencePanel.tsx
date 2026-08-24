import React from 'react';
import { Database, SearchCheck, ShieldAlert } from 'lucide-react';

export type GroundingEvidenceState = 'NOT_CONFIGURED' | 'READY' | 'OBSERVED' | 'FAILED';

export interface GroundingStatusSnapshot {
  provider: 'google-agent-search';
  state: GroundingEvidenceState;
  configured: boolean;
  detail: string;
  receipt?: {
    receiptSha256: string;
    sourceRevision: string;
    sources: Array<{ rank: number }>;
    citationCount: number;
    generationObserved: boolean;
    observedAt: string;
  };
}

interface GroundingEvidencePanelProps {
  snapshot: GroundingStatusSnapshot | null;
}

function statePresentation(state: GroundingEvidenceState | undefined) {
  switch (state) {
    case 'OBSERVED':
      return {
        label: 'GROUNDING_OBSERVED',
        classes: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      };
    case 'READY':
      return {
        label: 'GROUNDING_READY',
        classes: 'bg-cyan-50 border-cyan-200 text-cyan-800',
      };
    case 'FAILED':
      return {
        label: 'GROUNDING_FAILED',
        classes: 'bg-red-50 border-red-200 text-red-800',
      };
    default:
      return {
        label: 'NOT_CONFIGURED',
        classes: 'bg-slate-50 border-slate-200 text-slate-700',
      };
  }
}

export const GroundingEvidencePanel: React.FC<GroundingEvidencePanelProps> = ({ snapshot }) => {
  const presentation = statePresentation(snapshot?.state);
  const receipt = snapshot?.receipt;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-label="Grounding evidence status">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-100 bg-cyan-50 text-cyan-700">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">Grounding Evidence Lane</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${presentation.classes}`}>
                {presentation.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Google Agent Search retrieval evidence. A grounding observation is evidence input, not a Judge verdict.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
          {snapshot?.state === 'FAILED' ? (
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <SearchCheck className="h-3.5 w-3.5 text-cyan-600" />
          )}
          {snapshot?.provider ?? 'google-agent-search'}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700">
        <p className="font-medium">{snapshot?.detail ?? 'Grounding status has not been read yet.'}</p>
        {receipt && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sources</p>
              <p className="font-mono text-[11px]">{receipt.sources.length}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Citations</p>
              <p className="font-mono text-[11px]">{receipt.citationCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Generation</p>
              <p className="font-mono text-[11px]">{receipt.generationObserved ? 'OBSERVED' : 'NOT_USED'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Receipt</p>
              <p className="truncate font-mono text-[11px]" title={receipt.receiptSha256}>
                {receipt.receiptSha256.slice(0, 16)}…
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
