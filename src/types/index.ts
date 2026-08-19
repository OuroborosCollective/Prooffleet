/**
 * ProofFleet Core Domain Types
 * Verifiable Multi-Agent System specification contracts
 *
 * HARDENING (SPEC v1): truth scores and producer-side verification status
 * were removed from the seal path. Judgment happens exclusively via
 * Judge/IndependentVerifier (server/evidence/) and is expressed as a
 * VerdictRecord — never as an invented number.
 */

export type AgentRole =
  | 'orchestrator'
  | 'researcher'
  | 'engineer'
  | 'scout'
  | 'builder'
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

// ---------------------------------------------------------------------------
// SPEC §1 — Hardening types
// ---------------------------------------------------------------------------

export type JudgeVerdict = 'VERIFIED' | 'BLOCKED_BY_MISSING_EVIDENCE' | 'CONTRADICTED';
export type ConsentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type ProvisioningStatus = 'NOT_PROVISIONED' | 'PROVISIONED_VERIFIED' | 'PROVISIONING_FAILED';

export interface OperationSpec {
  operationId: string;          // stabile, vom Aufrufer vergebene Idempotency-ID
  kind: 'read' | 'write' | 'execute';
  actionName: string;
  targetResource: string;
  parameters: Record<string, unknown>;
  parametersHash: string;       // SHA-256 ueber canonical JSON der Parameter
  missionId: string;
  missionRevision: number;
}

export interface ConsentGrant {
  requestId: string;
  operationHash: string;        // bindet Consent an genau EINE OperationSpec
  decision: 'APPROVED' | 'REJECTED';
  operatorIdentity: string;
  decidedAt: string;
  expiresAt: string;
}

export interface EvidenceReceipt {
  receiptId: string;
  missionId: string;
  missionRevision: number;
  manifestHash: string;         // SHA-256 des Mission-Manifests (Ziele, Ops, Revision)
  payloadHash: string;          // SHA-256 des Evidence-Payloads
  previousReceiptHash: string;  // Kette
  receiptHash: string;          // SHA-256 ueber alle Felder oben
  createdAt: string;
  createdBy: AgentRole;
}

export interface VerdictRecord {
  subject: string;              // z.B. receiptHash oder operationId
  verdict: JudgeVerdict;
  rationale: string;
  missingEvidence?: string[];
  contradictions?: string[];
  judgedAt: string;
}

// ---------------------------------------------------------------------------
// Evidence — single definition (server/evidence/ledger.ts re-exports this).
// Seal path ONLY: no truthScore, no producer-side verificationStatus.
// ---------------------------------------------------------------------------

export interface EvidenceBlock {
  blockIndex: number;
  agentId: string;
  claim: string;
  payload: unknown;
  /** SHA-256 over canonicalJson(payload). */
  payloadHash: string;
  /** SHA-256 of the mission manifest this evidence is bound to. */
  manifestHash: string;
  missionRevision: number;
  previousHash: string;
  /** SHA-256 over all binding fields above. */
  blockHash: string;
  sealedAt: string;
  /** HMAC-SHA256 with env secret, or null when no secret is configured. */
  signature: string | null;
}

// ---------------------------------------------------------------------------
// Consent — operation-bound request (server/consent/consentTypes.ts re-exports).
// ---------------------------------------------------------------------------

export type ConsentDecision = 'APPROVED' | 'REJECTED';

/**
 * Ein ConsentRequest bindet eine menschliche Entscheidung an GENAU EINE
 * OperationSpec. Der operationHash (sha256 ueber canonical JSON der Spec)
 * macht den Grant unuebertragbar auf andere Operationen/Parameter/Revisionen.
 */
export interface ConsentRequest {
  requestId: string;
  /** sha256(canonicalJson(spec)) — Bindung an genau diese Operation. */
  operationHash: string;
  /** Redundante, aus der Spec kopierte Bindungs-Felder (fuer Review/Anzeige). */
  operationId: string;
  parametersHash: string;
  missionId: string;
  missionRevision: number;
  /** Unveraenderlicher Snapshot der vollstaendigen OperationSpec. */
  spec: Readonly<OperationSpec>;
  riskLevel: RiskLevel;
  justification: string;
  status: ConsentStatus;
  requestedAt: string;
  /** Gesetzt nach respond(); niemals automatisch. */
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
}

export interface GrantValidation {
  valid: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Mission / Telemetry
// ---------------------------------------------------------------------------

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
    /** Judge-Urteil ueber die reale Evidence — ersetzt den alten overallTruthScore. */
    judgeVerdict: VerdictRecord;
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
  chainIntegrityValid: boolean;
  activeAgentsCount: number;
  consentRequestsPending: number;
  /** null solange noch nie ein Consent entschieden wurde — kein erfundener Wert. */
  consentApprovalRate: number | null;
  /** null solange noch keine Verifikation lief — kein erfundener Wert. */
  lastVerifiedBlockHash: string | null;
}
