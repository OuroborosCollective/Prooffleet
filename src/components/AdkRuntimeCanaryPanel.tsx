import React, { FormEvent, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

export type AdkCanaryStatus = "NOT_RUN" | "RUNNING" | "OBSERVED" | "FAILED";

export interface AdkCanaryReceipt {
  schemaVersion: "prooffleet.adk-runtime-canary.v1";
  outcome: "ADK_RUNTIME_OBSERVED";
  sourceRevision: string;
  framework: "google-adk";
  modelId: "gemini-3.7-flash";
  challengeSha256: string;
  responseSha256: string;
  challengeMatched: true;
  finalResponseObserved: true;
  observedAt: string;
}

export interface AdkCanarySnapshot {
  eligible: boolean;
  sourceRevision: string | null;
  status: AdkCanaryStatus;
  receipt: AdkCanaryReceipt | null;
  failureReason: string | null;
}

interface AdkRuntimeCanaryPanelProps {
  canary: AdkCanarySnapshot | null;
  operatorConfigured: boolean;
  operatorAuthenticated: boolean;
  operatorIdentity: string | null;
  isAuthenticating: boolean;
  authError: string | null;
  isRunningCanary: boolean;
  canaryError: string | null;
  onAuthenticate: (token: string) => Promise<boolean>;
  onRunCanary: () => Promise<void>;
}

function shortHash(value: string | null | undefined): string {
  if (!value) return "—";
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function statusLabel(canary: AdkCanarySnapshot | null): string {
  if (!canary) return "READING RUNTIME";
  if (!canary.eligible) return "SOURCE BINDING REQUIRED";
  if (canary.status === "OBSERVED") return "ADK_RUNTIME_OBSERVED";
  return canary.status;
}

export function AdkRuntimeCanaryPanel({
  canary,
  operatorConfigured,
  operatorAuthenticated,
  operatorIdentity,
  isAuthenticating,
  authError,
  isRunningCanary,
  canaryError,
  onAuthenticate,
  onRunCanary,
}: AdkRuntimeCanaryPanelProps) {
  const [operatorToken, setOperatorToken] = useState("");

  const handleAuthenticate = async (event: FormEvent) => {
    event.preventDefault();
    if (!operatorToken) return;
    const authenticated = await onAuthenticate(operatorToken);
    if (authenticated) setOperatorToken("");
  };

  const eligible = canary?.eligible === true;
  const observed = canary?.status === "OBSERVED" && canary.receipt !== null;
  const running = isRunningCanary || canary?.status === "RUNNING";
  const canRun = eligible && operatorConfigured && operatorAuthenticated && !running && !observed;

  return (
    <section
      aria-labelledby="adk-canary-title"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="adk-canary-title" className="text-sm font-semibold text-slate-950">
              Google ADK runtime proof
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Challenge-response canary through the production Google ADK → Gemini path. It performs no tool call,
              cloud mutation, consent decision, or Judge action.
            </p>
          </div>
        </div>

        <span
          className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold tracking-wide text-slate-700"
          aria-live="polite"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {statusLabel(canary)}
        </span>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
                Runtime source
              </div>
              <div className="mt-2 font-mono text-xs text-slate-800" title={canary?.sourceRevision ?? undefined}>
                {shortHash(canary?.sourceRevision)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Framework / model</div>
              <div className="mt-2 text-sm font-medium text-slate-800">Google ADK · Gemini 3.7 Flash</div>
            </div>
          </div>

          {!canary ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Reading the current runtime proof state…
            </div>
          ) : !eligible ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                This runtime has no exact <code>PROOFFLEET_SOURCE_REVISION</code>. Canary execution is blocked until a
                source-bound candidate revision is running.
              </span>
            </div>
          ) : observed && canary.receipt ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Live ADK challenge-response observed
              </div>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-emerald-700">Challenge SHA-256</dt>
                  <dd className="mt-1 font-mono text-emerald-950">{shortHash(canary.receipt.challengeSha256)}</dd>
                </div>
                <div>
                  <dt className="text-emerald-700">Response SHA-256</dt>
                  <dd className="mt-1 font-mono text-emerald-950">{shortHash(canary.receipt.responseSha256)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-emerald-800">
                Raw prompt, challenge, response, and provider credentials are not included in this receipt.
              </p>
            </div>
          ) : canary.status === "FAILED" ? (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Canary failed closed: {canary.failureReason || "adk_canary_provider_error"}</span>
            </div>
          ) : (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-950">
              Runtime is source-bound and eligible. The model has not yet produced a live challenge-response receipt for
              this process.
            </div>
          )}

          {canaryError ? (
            <p role="alert" className="text-sm font-medium text-rose-700">
              {canaryError}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Operator authority
          </div>

          {!operatorConfigured ? (
            <p className="mt-3 text-sm text-slate-600">
              Operator authentication is not provisioned. The canary trigger remains unavailable.
            </p>
          ) : operatorAuthenticated ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-slate-600">
                Authenticated as <span className="font-medium text-slate-900">{operatorIdentity || "operator"}</span>.
              </p>
              {!observed ? (
                <button
                  type="button"
                  onClick={() => void onRunCanary()}
                  disabled={!canRun}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : canary?.status === "FAILED" ? (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                  {running ? "Running live canary…" : canary?.status === "FAILED" ? "Retry ADK canary" : "Run ADK live canary"}
                </button>
              ) : (
                <p className="text-xs font-medium text-emerald-700">This process already has an observed canary receipt.</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleAuthenticate} className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-slate-600" htmlFor="adk-canary-operator-token">
                Operator token
              </label>
              <input
                id="adk-canary-operator-token"
                type="password"
                autoComplete="current-password"
                value={operatorToken}
                onChange={(event) => setOperatorToken(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500 transition focus:ring-2"
              />
              <button
                type="submit"
                disabled={isAuthenticating || operatorToken.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAuthenticating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                Authenticate operator
              </button>
              {authError ? (
                <p role="alert" className="text-sm font-medium text-rose-700">
                  {authError}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
