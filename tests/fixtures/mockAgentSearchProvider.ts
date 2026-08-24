import type {
  AgentSearchEvidenceProvider,
  AgentSearchObservation,
  AgentSearchProviderStatus,
  GroundingQuery,
} from '../../server/evidence/grounding';
import { AGENT_SEARCH_PROVIDER } from '../../server/evidence/grounding';

export class MockAgentSearchEvidenceProvider implements AgentSearchEvidenceProvider {
  readonly provider = AGENT_SEARCH_PROVIDER;
  retrieveCalls = 0;

  constructor(
    private readonly providerStatus: AgentSearchProviderStatus,
    private readonly observation?: AgentSearchObservation,
    private readonly failure?: Error,
  ) {}

  async status(): Promise<AgentSearchProviderStatus> {
    return structuredClone(this.providerStatus);
  }

  async retrieve(_input: GroundingQuery): Promise<AgentSearchObservation> {
    this.retrieveCalls += 1;
    if (this.failure) throw this.failure;
    if (!this.observation) throw new Error('mock_observation_missing');
    return structuredClone(this.observation);
  }
}
