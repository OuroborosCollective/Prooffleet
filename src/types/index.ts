/**
 * ProofFleet Core Domain Types
 * Verifiable Multi-Agent System specification contracts
 */

export type AgentRole =
  | 'orchestrator'
  | 'researcher'
  | 'engineer'
  | 'analyst'
  | 'sentinel'
  | 'auditor'
  | 'gatekeeper'
  | 'operator';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'waiting_consent' | 'completed' | 'error';

export interface AgentContract {
  id: AgentRole;
  name: string;
  codename: string;
  title: string;
  description: string;
  model: string;
  capabilities: string[];
  permissions: ('read' | 'write' | 'execute' | 'verify' | 'consent_gate')[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: AgentStatus;
  avatarIcon: string;
  color: string;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EvidenceBlock {
  blockIndex: number;
  id: string;
  timestamp: string;
  agentId: AgentRole;
  claim: string;
  evidenceType: 'grounded_fact' | 'code_validation' | 'policy_check' | 'human_consent' | 'system_trace' | 'audit_verdict';
  dataPayload: Record<string, unknown>;
  citations?: { title: string; uri: string; confidence: number }[];
  previousHash: string;
  hash: string;
  signature: string;
  verificationStatus: 'VERIFIED' | 'FLAGGED' | 'PENDING' | 'INVALID';
  truthScore: number; // 0 to 100
}

export interface ConsentRequest {
  id: string;
  timestamp: string;
  agentId: AgentRole;
  actionName: string;
  targetResource: string;
  parameters: Record<string, unknown>;
  riskLevel: RiskLevel;
  riskJustification: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  decisionTimestamp?: string;
  reason?: string;
}

export interface ExecutionStep {
  stepId: string;
  agentId: AgentRole;
  timestamp: string;
  type: 'thought' | 'tool_call' | 'tool_result' | 'message' | 'evidence_sealed' | 'consent_gate' | 'status_change';
  content: string;
  metadata?: Record<string, unknown>;
  evidenceBlockId?: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  presetKey?: 'security_audit' | 'market_intel' | 'code_deploy' | 'custom';
  inputGoal: string;
  strictness: 'standard' | 'high_assurance' | 'military_grade';
  thinkingLevel: 'LOW' | 'HIGH';
  requireConsentForWrite: boolean;
  status: 'draft' | 'running' | 'paused_for_consent' | 'completed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  activeAgentId?: AgentRole;
  steps: ExecutionStep[];
  evidenceChain: EvidenceBlock[];
  consentRequests: ConsentRequest[];
  finalVerdict?: {
    summary: string;
    overallTruthScore: number;
    integrityVerified: boolean;
    compliancePassed: boolean;
    recommendations: string[];
    chainHashDigest: string;
  };
}

export interface FleetTelemetry {
  uptimeSeconds: number;
  totalMissionsRun: number;
  totalEvidenceBlocksSealed: number;
  overallConsensusScore: number;
  chainIntegrityValid: boolean;
  activeAgentsCount: number;
  consentRequestsPending: number;
  consentApprovalRate: number;
  lastVerifiedBlockHash: string;
}
