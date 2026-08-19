import React from "react";
import {
  Compass,
  Search,
  Cpu,
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Terminal,
  Activity,
  Shield,
  Fingerprint,
  RefreshCw,
  AlertCircle,
  Check,
} from "lucide-react";
import { AgentContract, AgentRole, EvidenceBlock } from "../types";

interface AgentFleetGridProps {
  agents: AgentContract[];
  activeAgentId?: AgentRole;
  evidenceChain?: EvidenceBlock[];
}

export const AgentFleetGrid: React.FC<AgentFleetGridProps> = ({
  agents,
  activeAgentId,
  evidenceChain = [],
}) => {
  const getIcon = (role: AgentRole) => {
    switch (role) {
      case "orchestrator":
        return <Compass className="w-4 h-4 text-blue-600" />;
      case "researcher":
        return <Search className="w-4 h-4 text-cyan-600" />;
      case "engineer":
        return <Cpu className="w-4 h-4 text-purple-600" />;
      case "analyst":
        return <BarChart3 className="w-4 h-4 text-pink-600" />;
      case "sentinel":
        return <ShieldAlert className="w-4 h-4 text-red-600" />;
      case "auditor":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case "gatekeeper":
        return <Lock className="w-4 h-4 text-amber-600" />;
      case "operator":
        return <Terminal className="w-4 h-4 text-slate-600" />;
    }
  };

  const getRiskBadge = (level: AgentContract["riskLevel"]) => {
    switch (level) {
      case "LOW":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "MEDIUM":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "HIGH":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "CRITICAL":
        return "bg-red-50 text-red-700 border-red-200 font-semibold";
    }
  };

  // Determine operational health state for each agent based on role & active execution
  const getAgentHealth = (role: AgentRole, isActive: boolean) => {
    if (role === "sentinel" && isActive) {
      return {
        type: "red" as const,
        label: "Guardrail Active",
        pulseBg: "bg-red-500",
        badgeBg: "bg-red-50 text-red-700 border-red-200",
        desc: "Zero-Trust Threat Scanning",
      };
    }
    if (role === "gatekeeper" && isActive) {
      return {
        type: "yellow" as const,
        label: "Consent Gate",
        pulseBg: "bg-amber-500",
        badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
        desc: "Awaiting Human Consent",
      };
    }
    if (isActive) {
      return {
        type: "blue" as const,
        label: "Processing",
        pulseBg: "bg-blue-500",
        badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
        desc: "Active Reasoning",
      };
    }
    return {
      type: "green" as const,
      label: "Healthy",
      pulseBg: "bg-emerald-500",
      badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      desc: "Contract Verified",
    };
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              8 Core Fleet Agents &amp; Operational Health
            </h2>
            <p className="text-xs text-slate-500">
              Real-Time Telemetry, Evidence Revisions &amp; Backreadable Continuity State
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            8 Optimal
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-mono text-[11px]">
            <Fingerprint className="w-3 h-3 text-slate-400" />
            Continuity Linked
          </span>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {agents.map((agent) => {
          const isActive = activeAgentId === agent.id;
          const health = getAgentHealth(agent.id, isActive);
          const agentBlocks = evidenceChain.filter((b) => b.agentId === agent.id);
          const lastBlock = agentBlocks[agentBlocks.length - 1];

          return (
            <div
              key={agent.id}
              className={`p-3.5 rounded-xl border transition-all relative overflow-hidden ${
                isActive
                  ? "border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-sm"
                  : "border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-slate-300"
              }`}
            >
              {/* Active Breathing Bar */}
              {isActive && (
                <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 animate-pulse" />
              )}

              {/* Agent Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-xs flex items-center justify-center relative">
                    {getIcon(agent.id)}
                    {/* Operational Health Status Dot */}
                    <span
                      className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${health.pulseBg} ${
                        isActive ? "animate-ping" : ""
                      }`}
                      title={`Operational Health: ${health.label}`}
                    />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 leading-tight">
                      {agent.name}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      {agent.codename}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${health.badgeBg}`}
                >
                  {health.label}
                </span>
              </div>

              <p className="text-[11px] text-slate-600 line-clamp-2 mb-2 leading-relaxed">
                {agent.description}
              </p>

              {/* Telemetry & Continuity Backreadable Hash Footer */}
              <div className="pt-2 border-t border-slate-200/60 space-y-1 text-[10px]">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {agent.model.replace("gemini-", "")}
                  </span>
                  <span className="font-medium text-slate-600 flex items-center gap-1">
                    <RefreshCw className="w-2.5 h-2.5 text-slate-400" />
                    <span>{agentBlocks.length} Evidences</span>
                  </span>
                </div>

                {/* Continuity Hash Link */}
                <div className="p-1 rounded bg-slate-100 text-slate-600 font-mono text-[9px] truncate flex items-center justify-between">
                  <span className="text-slate-400">Hash:</span>
                  <span className="font-bold text-slate-800">
                    {lastBlock ? `${lastBlock.hash.slice(0, 12)}...` : "GENESIS_ANCHOR"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
