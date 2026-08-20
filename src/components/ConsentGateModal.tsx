import React, { useEffect, useRef, useState } from "react";
import { Lock, Check, X, AlertTriangle, UserCheck } from "lucide-react";
import { ConsentRequest } from "../types";
import { escapeAction, nextDialogFocusIndex } from "./consentDialogFocus";

interface ConsentGateModalProps {
  request: ConsentRequest | null;
  onRespond: (decision: "APPROVED" | "REJECTED", reason?: string) => void;
  isSubmitting: boolean;
  operatorConfigured: boolean;
  operatorAuthenticated: boolean;
  operatorIdentity: string | null;
  onAuthenticate: (token: string) => Promise<boolean>;
  isAuthenticating: boolean;
  authError: string | null;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export const ConsentGateModal: React.FC<ConsentGateModalProps> = ({
  request,
  onRespond,
  isSubmitting,
  operatorConfigured,
  operatorAuthenticated,
  operatorIdentity,
  onAuthenticate,
  isAuthenticating,
  authError,
}) => {
  const [operatorToken, setOperatorToken] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOperatorToken("");
  }, [request?.requestId, operatorAuthenticated]);

  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [request?.requestId]);

  useEffect(() => {
    if (!request) return;
    const timer = window.setTimeout(() => {
      if (operatorConfigured && operatorAuthenticated && !isSubmitting) {
        rejectRef.current?.focus();
      } else if (operatorConfigured && !operatorAuthenticated) {
        tokenRef.current?.focus();
      } else {
        dialogRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [request?.requestId, operatorConfigured, operatorAuthenticated, isSubmitting]);

  if (!request) return null;

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (escapeAction(operatorConfigured, operatorAuthenticated, isSubmitting) === "REJECT") {
        onRespond("REJECTED", "Operator rejected execution with Escape key.");
      } else if (operatorConfigured) {
        tokenRef.current?.focus();
      } else {
        dialogRef.current?.focus();
      }
      return;
    }

    if (event.key !== "Tab") return;

    const nodeList = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const nodes: HTMLElement[] = nodeList ? Array.from(nodeList) : [];
    const enabledNodes = nodes.filter(
      (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
    );

    if (enabledNodes.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentIndex = active ? enabledNodes.indexOf(active) : -1;
    const nextIndex = nextDialogFocusIndex(currentIndex, enabledNodes.length, event.shiftKey);
    if (nextIndex >= 0) {
      event.preventDefault();
      enabledNodes[nextIndex].focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="consent-gate-title"
        aria-describedby="consent-gate-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="bg-amber-500 p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-600/80 flex items-center justify-center" aria-hidden="true">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 id="consent-gate-title" className="text-sm font-bold">Human Consent Gate Activated</h3>
              <p className="text-xs text-amber-100">Gatekeeper Policy Interception</p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-700 text-white uppercase tracking-wider">
            Risk: {request.riskLevel}
          </span>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-700">
          <div id="consent-gate-description">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Proposed Operation
            </span>
            <p className="text-sm font-bold text-slate-900">{request.spec.actionName}</p>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Target: {request.spec.targetResource}
            </p>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-amber-900 text-xs">Risk Assessment</p>
              <p className="text-[11px] text-amber-800 mt-0.5">{request.justification}</p>
            </div>
          </div>

          {!operatorConfigured ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800" role="alert">
              <p className="font-semibold">Operator authentication is not provisioned.</p>
              <p className="mt-1 text-[11px]">
                Configure the operator token and session secret before consent can be decided.
              </p>
            </div>
          ) : operatorAuthenticated ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800">
              <UserCheck className="w-4 h-4" aria-hidden="true" />
              <span>
                Authenticated operator: <strong>{operatorIdentity || "operator"}</strong>
              </span>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label
                className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider"
                htmlFor="operator-token"
              >
                Authenticate operator before deciding
              </label>
              <div className="flex gap-2">
                <input
                  ref={tokenRef}
                  id="operator-token"
                  type="password"
                  autoComplete="current-password"
                  value={operatorToken}
                  onChange={(event) => setOperatorToken(event.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  placeholder="Operator token"
                />
                <button
                  type="button"
                  disabled={isAuthenticating || operatorToken.length === 0}
                  onClick={async () => {
                    const ok = await onAuthenticate(operatorToken);
                    if (ok) setOperatorToken("");
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {isAuthenticating ? "Checking…" : "Authenticate"}
                </button>
              </div>
              {authError && <p className="text-[11px] text-red-700" role="alert">{authError}</p>}
            </div>
          )}

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Action Parameters
            </span>
            <pre className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-800 font-mono overflow-x-auto">
              {JSON.stringify(request.spec.parameters, null, 2)}
            </pre>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            ref={rejectRef}
            type="button"
            disabled={isSubmitting || !operatorAuthenticated || !operatorConfigured}
            onClick={() => onRespond("REJECTED", "Operator rejected execution during security review.")}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 active:scale-[0.98] font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Reject Action</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting || !operatorAuthenticated || !operatorConfigured}
            onClick={() => onRespond("APPROVED", "Human operator verified and approved action.")}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>Approve &amp; Authorize</span>
          </button>
        </div>
      </div>
    </div>
  );
};
