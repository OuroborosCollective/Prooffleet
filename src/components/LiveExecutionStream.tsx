import React from "react";
import {
  Activity,
  CheckCircle2,
  Lock,
  Terminal,
  Cpu,
  Layers,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { ExecutionStep, AgentRole } from "../types";

interface LiveExecutionStreamProps {
  steps: ExecutionStep[];
  activeAgentId?: AgentRole;
  isRunning: boolean;
}

export const LiveExecutionStream: React.FC<LiveExecutionStreamProps> = ({
  steps,
  activeAgentId,
  isRunning,
}) => {
  const getAgentBadge = (agentId: AgentRole) => {
    switch (agentId) {
      case "orchestrator":
        return { name: "Commander", color: "bg-blue-100 text-blue-800 border-blue-200" };
      case "researcher":
        return { name: "Scout", color: "bg-cyan-100 text-cyan-800 border-cyan-200" };
      case "engineer":
        return { name: "Builder", color: "bg-purple-100 text-purple-800 border-purple-200" };
      case "analyst":
        return { name: "Analyst", color: "bg-pink-100 text-pink-800 border-pink-200" };
      case "sentinel":
        return { name: "Sentinel", color: "bg-red-100 text-red-800 border-red-200" };
      case "auditor":
        return { name: "Auditor", color: "bg-emerald-100 text-emerald-800 border-emerald-200" };
      case "gatekeeper":
        return { name: "Gatekeeper", color: "bg-amber-100 text-amber-800 border-amber-200" };
      case "operator":
        return { name: "Operator", color: "bg-slate-200 text-slate-800 border-slate-300" };
    }
  };

  const getStepIcon = (type: ExecutionStep["type"]) => {
    switch (type) {
      case "evidence_sealed":
        return <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />;
      case "consent_gate":
        return <Lock className="w-3.5 h-3.5 text-amber-600" />;
      case "thought":
        return <Cpu className="w-3.5 h-3.5 text-blue-600" />;
      case "tool_call":
      case "tool_result":
        return <Terminal className="w-3.5 h-3.5 text-purple-600" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Live Agent Execution Stream
            </h2>
            <p className="text-xs text-slate-500">
              Real-time reasoning logs &amp; step-by-step DAG telemetry
            </p>
          </div>
        </div>

        {isRunning && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            Active Agent: {activeAgentId?.toUpperCase()}
          </span>
        )}
      </div>

      {/* Stream List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[480px]">
        {steps.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-xl p-6 text-center">
            <Layers className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-xs font-medium text-slate-600">No Active Mission Stream</p>
            <p className="text-[11px] text-slate-400 max-w-xs mt-1">
              Select a mission preset or enter an objective in Mission Control to start verifiable execution.
            </p>
          </div>
        ) : (
          steps.map((step) => {
            const badge = getAgentBadge(step.agentId);
            const isEvidence = step.type === "evidence_sealed";
            const isConsent = step.type === "consent_gate";

            return (
              <div
                key={step.stepId}
                className={`p-3.5 rounded-xl border transition-all text-xs ${
                  isEvidence
                    ? "bg-emerald-50/50 border-emerald-200 shadow-xs"
                    : isConsent
                    ? "bg-amber-50/50 border-amber-200 shadow-xs"
                    : "bg-slate-50/70 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${badge.color}`}
                    >
                      {badge.name}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 font-medium capitalize">
                      {getStepIcon(step.type)}
                      {step.type.replace("_", " ")}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(step.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-slate-800 whitespace-pre-wrap font-sans text-[11px] sm:text-xs leading-relaxed">
                  {step.content}
                </div>

                {/* Citations if available */}
                {Array.isArray(step.metadata?.citations) && (
                  <div className="mt-2 pt-2 border-t border-slate-200/80 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-500">Citations:</span>
                    {step.metadata.citations.map((c: any, i: number) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[10px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700"
                      >
                        <span>{c.title}</span>
                        <span className="text-slate-400 font-mono text-[9px]">
                          ({Math.round(c.confidence * 100)}%)
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
