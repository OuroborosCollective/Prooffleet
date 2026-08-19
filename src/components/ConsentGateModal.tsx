import React from "react";
import { Lock, ShieldAlert, Check, X, AlertTriangle, UserCheck } from "lucide-react";
import { ConsentRequest } from "../types";

interface ConsentGateModalProps {
  request: ConsentRequest | null;
  onRespond: (decision: "APPROVED" | "REJECTED", reason?: string) => void;
  isSubmitting: boolean;
}

export const ConsentGateModal: React.FC<ConsentGateModalProps> = ({
  request,
  onRespond,
  isSubmitting,
}) => {
  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-amber-500 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-600/80 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Human Consent Gate Activated</h3>
              <p className="text-xs text-amber-100">Gatekeeper Policy Interception</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-700 text-white uppercase tracking-wider">
            Risk: {request.riskLevel}
          </span>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs text-slate-700">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Proposed Operation
            </span>
            <p className="text-sm font-bold text-slate-900">{request.spec.actionName}</p>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Target: {request.spec.targetResource}
            </p>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-xs">Risk Assessment</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                {request.justification}
              </p>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Action Parameters
            </span>
            <pre className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-800 font-mono overflow-x-auto">
              {JSON.stringify(request.spec.parameters, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onRespond("REJECTED", "Operator rejected execution during security review.")}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 active:scale-[0.98] font-semibold text-xs transition-all"
          >
            <X className="w-4 h-4" />
            <span>Reject Action</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onRespond("APPROVED", "Human operator verified and approved action.")}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Approve &amp; Authorize</span>
          </button>
        </div>
      </div>
    </div>
  );
};
