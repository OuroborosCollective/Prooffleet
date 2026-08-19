import React, { useState } from "react";
import {
  ShieldCheck,
  Fingerprint,
  Link,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { EvidenceBlock } from "../types";

interface EvidenceChainLedgerProps {
  chain: EvidenceBlock[];
  onVerifyChain: () => void;
  isVerifying: boolean;
  integrityResult?: {
    isValid: boolean;
    details: string;
  } | null;
}

export const EvidenceChainLedger: React.FC<EvidenceChainLedgerProps> = ({
  chain,
  onVerifyChain,
  isVerifying,
  integrityResult,
}) => {
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedBlockId(expandedBlockId === id ? null : id);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Fingerprint className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Evidence &amp; Truth Ledger
            </h2>
            <p className="text-xs text-slate-500">
              Tamper-evident SHA-256 hash chain with cryptographic provenance
            </p>
          </div>
        </div>

        <button
          onClick={onVerifyChain}
          disabled={isVerifying}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-semibold shadow-xs transition-all"
        >
          <ShieldCheck className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
          <span>{isVerifying ? "Verifying Ledger..." : "Verify All Hashes"}</span>
        </button>
      </div>

      {/* Integrity Banner */}
      {integrityResult && (
        <div
          className={`mb-4 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
            integrityResult.isValid
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
              : "bg-red-50/80 border-red-200 text-red-900"
          }`}
        >
          {integrityResult.isValid ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-bold">
              {integrityResult.isValid
                ? "Cryptographic Chain Verified 100% Intact"
                : "Chain Integrity Compromised"}
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {integrityResult.details}
            </p>
          </div>
        </div>
      )}

      {/* Block List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[480px]">
        {chain.map((block) => {
          const isExpanded = expandedBlockId === block.id;

          return (
            <div
              key={block.id}
              className="border border-slate-200 rounded-xl bg-slate-50/40 hover:bg-white transition-all overflow-hidden"
            >
              {/* Block Header */}
              <div
                onClick={() => toggleExpand(block.id)}
                className="p-3 cursor-pointer flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="shrink-0 w-6 h-6 rounded-md bg-slate-800 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                    #{block.blockIndex}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {block.claim}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400 truncate">
                      Agent: {block.agentId.toUpperCase()} • Type: {block.evidenceType}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {block.truthScore}% Truth
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Block Body */}
              {isExpanded && (
                <div className="p-3.5 bg-white border-t border-slate-200 text-xs space-y-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                      Current SHA-256 Digest
                    </label>
                    <div className="p-2 rounded bg-slate-900 text-emerald-400 font-mono text-[11px] break-all select-all">
                      {block.hash}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                      <Link className="w-3 h-3 text-slate-400" />
                      Previous Block Hash Pointer
                    </label>
                    <div className="p-1.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] break-all select-all">
                      {block.previousHash}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                      HMAC Signature (secp256 Agent Key)
                    </label>
                    <div className="p-1.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] break-all select-all">
                      {block.signature}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                      Audited Data Payload
                    </label>
                    <pre className="p-2 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 font-mono overflow-x-auto">
                      {JSON.stringify(block.dataPayload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
