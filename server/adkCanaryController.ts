import {
  runAdkRuntimeCanary,
  type AdkRuntimeCanaryDependencies,
  type AdkRuntimeCanaryReceipt,
} from "./adkCanary";

export type AdkRuntimeCanaryStatus = "NOT_RUN" | "RUNNING" | "OBSERVED" | "FAILED";

export interface AdkRuntimeCanarySnapshot {
  eligible: boolean;
  sourceRevision: string | null;
  status: AdkRuntimeCanaryStatus;
  receipt: AdkRuntimeCanaryReceipt | null;
  failureReason: string | null;
}

const KNOWN_FAILURE_REASONS = new Set([
  "adk_canary_source_revision_invalid",
  "adk_canary_nonce_invalid",
  "adk_canary_provider_not_configured",
  "adk_canary_empty_final_response",
  "adk_canary_challenge_mismatch",
]);

function normalizeFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return KNOWN_FAILURE_REASONS.has(message)
    ? message
    : "adk_canary_provider_error";
}

function normalizeSourceRevision(sourceRevision: string | undefined): string | null {
  if (!sourceRevision || !/^[0-9a-f]{40}$/.test(sourceRevision)) {
    return null;
  }
  return sourceRevision;
}

/**
 * Process-local controller for the bounded ADK runtime canary.
 *
 * Important boundaries:
 * - source revision is fixed at process construction time;
 * - only one provider call may be in flight at once;
 * - an OBSERVED receipt is memoized and never re-issued in this process;
 * - raw provider failures are reduced to a small non-sensitive reason enum;
 * - this controller carries no authority over consent, external effects or Judge verdicts.
 */
export class AdkRuntimeCanaryController {
  private readonly sourceRevision: string | null;
  private statusValue: AdkRuntimeCanaryStatus = "NOT_RUN";
  private receiptValue: AdkRuntimeCanaryReceipt | null = null;
  private failureReasonValue: string | null = null;
  private inFlight: Promise<AdkRuntimeCanarySnapshot> | null = null;

  constructor(sourceRevision: string | undefined) {
    this.sourceRevision = normalizeSourceRevision(sourceRevision);
  }

  snapshot(): AdkRuntimeCanarySnapshot {
    return {
      eligible: this.sourceRevision !== null,
      sourceRevision: this.sourceRevision,
      status: this.statusValue,
      receipt: this.receiptValue,
      failureReason: this.failureReasonValue,
    };
  }

  async trigger(
    dependencies: AdkRuntimeCanaryDependencies = {},
  ): Promise<AdkRuntimeCanarySnapshot> {
    if (!this.sourceRevision) {
      this.statusValue = "FAILED";
      this.failureReasonValue = "adk_canary_runtime_not_source_bound";
      return this.snapshot();
    }

    if (this.statusValue === "OBSERVED" && this.receiptValue) {
      return this.snapshot();
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.statusValue = "RUNNING";
    this.failureReasonValue = null;

    this.inFlight = (async () => {
      try {
        this.receiptValue = await runAdkRuntimeCanary(
          this.sourceRevision as string,
          dependencies,
        );
        this.statusValue = "OBSERVED";
        this.failureReasonValue = null;
      } catch (error) {
        this.receiptValue = null;
        this.statusValue = "FAILED";
        this.failureReasonValue = normalizeFailureReason(error);
      } finally {
        this.inFlight = null;
      }

      return this.snapshot();
    })();

    return this.inFlight;
  }
}
