import React from "react";
import { ShieldCheck, Activity, Fingerprint, Layers, Cpu } from "lucide-react";
import { FleetTelemetry } from "../types";
import { deriveChainTruthPresentation } from "./runtimeTruthPresentation";

interface NavbarProps {
  telemetry: FleetTelemetry | null;
  isConnected: boolean;
  onVerifyChain: () => void;
  isVerifying: boolean;
}

const CHAIN_TONE_CLASSES = {
  verified: "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100",
  unverified: "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100",
  neutral: "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200",
} as const;

export const Navbar: React.FC<NavbarProps> = ({
  telemetry,
  isConnected,
  onVerifyChain,
  isVerifying,
}) => {
  const chain = deriveChainTruthPresentation(
    telemetry?.totalEvidenceBlocksSealed,
    telemetry?.chainIntegrityValid,
  );

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                ProofFleet
              </h1>
              <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80">
                Phase 0 Substrate
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Verifiable Multi-Agent System &amp; Cryptographic Truth Ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <span className="hidden md:inline">
              {isConnected ? "SSE Stream Active" : "Polling"}
            </span>
          </div>

          <button
            onClick={onVerifyChain}
            disabled={isVerifying}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${CHAIN_TONE_CLASSES[chain.tone]}`}
            title={chain.description}
          >
            <ShieldCheck
              className={`w-3.5 h-3.5 ${
                isVerifying
                  ? "animate-spin text-blue-600"
                  : chain.isVerified
                    ? "text-emerald-600"
                    : "text-slate-600"
              }`}
            />
            <span className="hidden sm:inline">
              {isVerifying ? "Verifying Chain..." : chain.label}
            </span>
          </button>

          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200 text-xs text-slate-600">
            <div className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>{telemetry?.totalEvidenceBlocksSealed ?? 0} Blocks</span>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <Cpu className="w-3.5 h-3.5 text-blue-500" />
              <span>8 Core Agents</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
