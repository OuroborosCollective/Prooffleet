import {
  buildGroundingReceipt,
  type AgentSearchEvidenceProvider,
  type GroundingQuery,
  type GroundingReceipt,
} from './grounding';

export const GROUNDING_BILLING_CANARY_CONFIRMATION =
  'I_APPROVE_ONE_AGENT_SEARCH_BILLING_CANARY' as const;

export type GroundingBillingCanaryState =
  | 'DISABLED'
  | 'INELIGIBLE_SOURCE'
  | 'READY'
  | 'RUNNING'
  | 'NOT_CONFIGURED'
  | 'OBSERVED'
  | 'SPENT_FAILED'
  | 'BLOCKED';

export interface GroundingBillingCanaryEnv {
  PROOFFLEET_GROUNDING_BILLING_CANARY_CONFIRMATION?: string;
}

export interface GroundingBillingCanarySnapshot {
  state: GroundingBillingCanaryState;
  armed: boolean;
  eligible: boolean;
  sourceRevision: string | null;
  maxProviderRequests: 1;
  providerRequestsUsed: 0 | 1;
  receipt?: GroundingReceipt;
  failureReason?: string;
}

function exactSourceRevision(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function cloneSnapshot(
  snapshot: GroundingBillingCanarySnapshot,
): GroundingBillingCanarySnapshot {
  return structuredClone(snapshot);
}

export class GroundingBillingCanaryController {
  private snapshotState: GroundingBillingCanarySnapshot;
  private inFlight: Promise<GroundingBillingCanarySnapshot> | null = null;

  constructor(
    sourceRevision: string | undefined,
    private readonly provider: AgentSearchEvidenceProvider,
    armed: boolean,
  ) {
    const source = exactSourceRevision(sourceRevision);
    this.snapshotState = {
      state: !source ? 'INELIGIBLE_SOURCE' : armed ? 'READY' : 'DISABLED',
      armed,
      eligible: Boolean(source && armed),
      sourceRevision: source,
      maxProviderRequests: 1,
      providerRequestsUsed: 0,
    };
  }

  snapshot(): GroundingBillingCanarySnapshot {
    return cloneSnapshot(this.snapshotState);
  }

  trigger(input: GroundingQuery): Promise<GroundingBillingCanarySnapshot> {
    if (this.snapshotState.state === 'OBSERVED') {
      return Promise.resolve(this.snapshot());
    }
    if (this.inFlight) return this.inFlight;
    if (!this.snapshotState.eligible || !this.snapshotState.sourceRevision) {
      return Promise.resolve(this.snapshot());
    }
    if (this.snapshotState.providerRequestsUsed >= 1) {
      return Promise.resolve(this.snapshot());
    }

    const missionId = input.missionId.trim();
    const query = input.query.trim();
    if (
      !missionId ||
      !query ||
      input.sourceRevision !== this.snapshotState.sourceRevision
    ) {
      this.snapshotState = {
        ...this.snapshotState,
        state: 'BLOCKED',
        eligible: false,
        failureReason: 'grounding_billing_canary_input_mismatch',
      };
      return Promise.resolve(this.snapshot());
    }

    this.inFlight = this.runOnce({
      missionId,
      query,
      sourceRevision: input.sourceRevision,
    }).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runOnce(
    input: GroundingQuery,
  ): Promise<GroundingBillingCanarySnapshot> {
    let status;
    try {
      status = await this.provider.status();
    } catch {
      this.snapshotState = {
        ...this.snapshotState,
        state: 'NOT_CONFIGURED',
        failureReason: 'grounding_provider_status_error',
      };
      return this.snapshot();
    }

    if (!status.configured) {
      this.snapshotState = {
        ...this.snapshotState,
        state: 'NOT_CONFIGURED',
        failureReason: 'grounding_provider_not_configured',
      };
      return this.snapshot();
    }

    this.snapshotState = {
      ...this.snapshotState,
      state: 'RUNNING',
      providerRequestsUsed: 1,
      failureReason: undefined,
    };

    try {
      const observation = await this.provider.retrieve(input);
      const receipt = buildGroundingReceipt(input, observation);
      this.snapshotState = {
        ...this.snapshotState,
        state: 'OBSERVED',
        receipt,
      };
      return this.snapshot();
    } catch {
      this.snapshotState = {
        ...this.snapshotState,
        state: 'SPENT_FAILED',
        failureReason: 'grounding_billing_canary_provider_error',
      };
      return this.snapshot();
    }
  }
}

export function createGroundingBillingCanaryController(
  sourceRevision: string | undefined,
  provider: AgentSearchEvidenceProvider,
  env: GroundingBillingCanaryEnv,
): GroundingBillingCanaryController {
  const armed =
    env.PROOFFLEET_GROUNDING_BILLING_CANARY_CONFIRMATION ===
    GROUNDING_BILLING_CANARY_CONFIRMATION;
  return new GroundingBillingCanaryController(sourceRevision, provider, armed);
}
