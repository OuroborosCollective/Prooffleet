import React from "react";
import { BarChart2 } from "lucide-react";

interface MissionAnalyticsProps {
  totalMissionsRun?: number;
}

/**
 * Fleet Mission Analytics — HARDENED.
 * The previous version rendered fabricated trend lines (hardcoded truthScore /
 * latency numbers). That violates the "no simulated truth" principle, so this
 * component now shows only what was actually measured: the real number of
 * missions run in this server process. Historical per-mission metrics are not
 * recorded yet — the UI says so honestly instead of inventing data.
 */
export const MissionAnalytics: React.FC<MissionAnalyticsProps> = ({
  totalMissionsRun = 0,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Fleet Mission Analytics
            </h2>
            <p className="text-xs text-slate-500">
              Measured telemetry only — no simulated scores or trends
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200">
            Total Missions Run: {totalMissionsRun}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40">
        <p className="text-xs text-slate-600 leading-relaxed">
          Historical per-mission metrics (latency, verdict distribution) are not
          recorded by this deployment yet, so no chart is rendered. Verdicts are
          available per mission as Judge VerdictRecords (VERIFIED /
          BLOCKED_BY_MISSING_EVIDENCE / CONTRADICTED) in the audit report above —
          ProofFleet deliberately does not display invented aggregate scores.
        </p>
      </div>
    </div>
  );
};
