/**
 * fleetRunner.ts — Orchestriert die acht echten Agentenmodule aus server/agents/
 * (SPEC §4/§6).
 *
 * Haerte-Garantien:
 * - KEIN Auto-Consent: die Mission geht in 'paused_for_consent' und bleibt dort,
 *   bis /api/consent/respond einen echten Operator-Grant liefert
 *   (resumeWithGrant). Es gibt keinen Timer und kein Auto-Approve.
 * - Rollenkontexte strikt: nur der gatekeeper bekommt requestConsent; nur
 *   builder/operator bekommen Executor-Zugang (hier: bewusst KEIN Executor,
 *   solange kein provisioniertes Execution-Target existiert — der Operator
 *   meldet dann ehrlich 'not_executed').
 * - finalVerdict.judgeVerdict kommt vom Judge (server/evidence/judge) ueber die
 *   reale Evidence + Receipts. Keine hartcodierten Scores.
 */

import { getGenAI } from "./gemini";
import {
  FLEET,
  createOrchestratorAgent,
  createScoutAgent,
  createOperatorAgent,
  type FleetAgent,
  type AgentContext,
  type AgentOutput,
  type LlmProvider,
} from "./agents/index";
import {
  EvidenceLedger,
  ReceiptChain,
  Judge,
  MemoryStore,
  canonicalJson,
  sha256Hex,
} from "./evidence/index";
import { ConsentEngine } from "./consent/consentEngine";
import type {
  AgentRole,
  ConsentGrant,
  ConsentRequest,
  ExecutionStep,
  Mission,
  OperationSpec,
  VerdictRecord,
} from "../src/types/index";

const PRE_GATE_ROLES = ["orchestrator", "scout", "builder", "analyst", "sentinel", "auditor"] as const;
const FINALIZE_CLAIM = "mission finalized";

interface FleetEvent {
  type: string;
  data: unknown;
}

export class FleetRunner {
  private ledger = new EvidenceLedger();
  private receipts = new ReceiptChain();
  private memoryStore = new MemoryStore();
  private consentEngine = new ConsentEngine();
  private activeMission: Mission | null = null;
  private eventListeners: Array<(event: FleetEvent) => void> = [];
  private missionsRun = 0;

  // ------------------------------------------------------------------ events

  public subscribe(listener: (event: FleetEvent) => void) {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  private emit(type: string, data: unknown) {
    this.eventListeners.forEach((listener) => {
      try {
        listener({ type, data });
      } catch (err) {
        console.error("Error emitting fleet event:", err);
      }
    });
  }

  // ------------------------------------------------------------------ state

  public getActiveMission(): Mission | null {
    return this.activeMission;
  }

  public getLedger(): EvidenceLedger {
    return this.ledger;
  }

  public getReceiptChain(): ReceiptChain {
    return this.receipts;
  }

  public getConsentEngine(): ConsentEngine {
    return this.consentEngine;
  }

  public getMissionsRun(): number {
    return this.missionsRun;
  }

  /** Reset fuer /api/evidence/reset: neue Ledger/Receipt/Memory-Instanzen. */
  public resetEvidence(): void {
    this.ledger = new EvidenceLedger();
    this.receipts = new ReceiptChain();
    this.memoryStore = new MemoryStore();
    this.activeMission = null;
  }

  // ------------------------------------------------------------------ mission

  public async startMission(
    title: string,
    inputGoal: string,
    presetKey: Mission["presetKey"] = "custom",
    strictness: Mission["strictness"] = "high_assurance",
    thinkingLevel: Mission["thinkingLevel"] = "HIGH",
    requireConsentForWrite: boolean = true
  ): Promise<Mission> {
    const missionId = `mission-${Date.now().toString(36)}`;
    const missionRevision = 1;
    const manifestHash = sha256Hex(
      canonicalJson({ missionId, inputGoal, requireConsentForWrite, missionRevision })
    );

    const mission: Mission = {
      id: missionId,
      title: title || "Autonomous Multi-Agent Mission",
      description: inputGoal,
      presetKey,
      inputGoal,
      strictness,
      thinkingLevel,
      requireConsentForWrite,
      status: "running",
      startedAt: new Date().toISOString(),
      activeAgentId: "orchestrator",
      steps: [],
      evidenceChain: [],
      consentRequests: [],
    };

    this.activeMission = mission;
    this.missionsRun += 1;
    this.emit("mission_started", mission);

    this.executePreGate(mission, manifestHash, missionRevision).catch((err) => {
      console.error("Mission execution pipeline failed:", err);
      if (this.activeMission?.id === mission.id) {
        this.activeMission.status = "failed";
        this.emit("mission_failed", { error: String(err) });
      }
    });

    return mission;
  }

  /**
   * Resume-Pfad: wird AUSSCHLIESSLICH von /api/consent/respond mit einem
   * echten ConsentGrant der ConsentEngine aufgerufen. Kein Timer, kein
   * Auto-Approve — ohne Grant passiert hier nichts.
   */
  public async resumeWithGrant(grant: ConsentGrant): Promise<Mission | null> {
    const mission = this.activeMission;
    if (!mission || mission.status !== "paused_for_consent") {
      return null;
    }
    const request = this.consentEngine.getRequest(grant.requestId);
    if (!request) {
      return null;
    }
    const validation = this.consentEngine.validateGrantForOperation(
      grant,
      request.spec as OperationSpec
    );
    if (!validation.valid) {
      this.addStep(mission, "gatekeeper", "consent_gate",
        `Consent grant rejected by validation: ${validation.reason}`);
      return mission;
    }

    const missionRevision = request.missionRevision;
    const manifestHash = sha256Hex(
      canonicalJson({
        missionId: mission.id,
        inputGoal: mission.inputGoal,
        requireConsentForWrite: mission.requireConsentForWrite,
        missionRevision,
      })
    );

    mission.status = "running";

    if (grant.decision === "APPROVED") {
      this.addStep(mission, "gatekeeper", "consent_gate",
        `Operator consent APPROVED by ${grant.operatorIdentity} — resuming mission.`,
        { requestId: grant.requestId, operationHash: grant.operationHash });

      // Operator bekommt den Grant + Spec ueber den Context. Bewusst KEIN
      // Executor injiziert: ohne provisioniertes Execution-Target meldet der
      // Operator ehrlich 'not_executed' statt Erfolg zu behaupten.
      const operator = createOperatorAgent();
      const sharedMemory = this.memoryStoreFor("operator");
      sharedMemory.set("approvedConsent", grant);
      sharedMemory.set("pendingOperationSpec", request.spec);
      await this.runAgent(mission, operator, manifestHash, missionRevision);
    } else {
      this.addStep(mission, "gatekeeper", "consent_gate",
        `Operator consent REJECTED by ${grant.operatorIdentity} — mission aborted by human decision.`,
        { requestId: grant.requestId });
    }

    this.finalizeMission(mission, manifestHash, missionRevision, grant.decision === "APPROVED");
    return mission;
  }

  // ------------------------------------------------------------------ pipeline

  private llmProvider(): LlmProvider | undefined {
    const genAI = getGenAI();
    if (!genAI) return undefined;
    return {
      generate: async (prompt: string) => {
        const response = await genAI.models.generateContent({
          model: "gemini-3.7-flash",
          contents: prompt,
        });
        return response.text || "";
      },
    };
  }

  private buildFleet(): FleetAgent[] {
    const llm = this.llmProvider();
    // Nur die Rollen, die laut SPEC einen Provider sinnvoll nutzen, bekommen ihn.
    return FLEET.map((agent) => {
      if (agent.role === "orchestrator") return createOrchestratorAgent(llm);
      if (agent.role === "scout") return createScoutAgent({ llm });
      return agent;
    });
  }

  private memoryStoreFor(role: string) {
    return {
      get: (k: string) => this.memoryStore.get(role, k)?.value,
      set: (k: string, v: unknown) => {
        this.memoryStore.set(role, k, v);
      },
    };
  }

  private async executePreGate(mission: Mission, manifestHash: string, missionRevision: number) {
    const fleet = this.buildFleet();
    const byRole = new Map(fleet.map((a) => [a.role, a]));

    for (const role of PRE_GATE_ROLES) {
      const agent = byRole.get(role);
      if (!agent) throw new Error(`fleet agent missing for role: ${role}`);

      // Echte Snapshots fuer analyst/sentinel/auditor in den Context legen.
      if (role === "analyst" || role === "sentinel") {
        this.memoryStoreFor(role).set("evidenceSnapshot", this.evidenceSnapshot());
      }
      if (role === "sentinel") {
        this.memoryStoreFor(role).set(
          "fleetRoles",
          fleet.map((a) => ({ role: a.role, permissions: a.permissions }))
        );
      }
      if (role === "auditor") {
        this.memoryStoreFor(role).set("chainSnapshot", this.ledger.getChain());
      }

      await this.runAgent(mission, agent, manifestHash, missionRevision);
    }

    // GATEKEEPER: erstellt den Consent-Request und pausiert die Mission.
    // KEIN Warten, KEIN Auto-Approve — Resume nur via resumeWithGrant().
    if (mission.requireConsentForWrite) {
      const gatekeeper = byRole.get("gatekeeper");
      if (!gatekeeper) throw new Error("fleet agent missing for role: gatekeeper");
      await this.runAgent(mission, gatekeeper, manifestHash, missionRevision);
      mission.status = "paused_for_consent";
      this.emit("mission_paused", { missionId: mission.id });
      return;
    }

    // requireConsentForWrite=false: ehrlich markieren, dass kein Consent noetig war.
    const operator = byRole.get("operator");
    if (operator) {
      await this.runAgent(mission, operator, manifestHash, missionRevision);
    }
    this.finalizeMission(mission, manifestHash, missionRevision, true);
  }

  private evidenceSnapshot() {
    return this.ledger.getChain().map((b) => ({
      evidenceType:
        typeof (b.payload as Record<string, unknown> | null)?.evidenceType === "string"
          ? (b.payload as Record<string, unknown>).evidenceType
          : "unknown",
      claim: b.claim,
      createdBy: b.agentId,
    }));
  }

  private async runAgent(
    mission: Mission,
    agent: FleetAgent,
    manifestHash: string,
    missionRevision: number
  ): Promise<AgentOutput> {
    const role = agent.role as AgentRole;
    mission.activeAgentId = role;
    this.addStep(mission, role, "status_change", `${role} activated.`);

    const memory = this.memoryStoreFor(agent.role);
    const ctx: AgentContext = {
      missionId: mission.id,
      missionRevision,
      inputGoal: mission.inputGoal,
      memory,
      emitEvidence: (claim, evidenceType, payload) => {
        const block = this.ledger.seal({
          agentId: agent.role,
          claim,
          payload: { ...payload, evidenceType },
          manifestHash,
          missionRevision,
        });
        this.receipts.issueReceipt({
          missionId: mission.id,
          missionRevision,
          manifestHash,
          payloadHash: block.payloadHash,
          createdBy: role,
        });
        this.addStep(
          mission,
          role,
          "evidence_sealed",
          `Sealed Evidence Block #${block.blockIndex} [SHA256: ${block.blockHash.slice(0, 16)}...]`,
          undefined,
          block.blockHash
        );
        return block.blockHash;
      },
      logger: (msg) => console.log(`[fleet:${agent.role}] ${msg}`),
    };

    // Nur der gatekeeper bekommt requestConsent (Separation of Duties).
    if (agent.role === "gatekeeper") {
      ctx.requestConsent = (spec: unknown) => {
        const request = this.consentEngine.createRequest(
          spec as OperationSpec,
          "HIGH",
          `Mission "${mission.title}": Operation erfordert menschliche Freigabe (operation-bound, kein Auto-Approve).`
        );
        mission.consentRequests.push(request);
        this.addStep(
          mission,
          "gatekeeper",
          "consent_gate",
          `Human Consent Gate Triggered: Operation '${request.spec.actionName}' requires operator authorization.`,
          { requestId: request.requestId }
        );
        this.emit("consent_requested", request);
        return request.requestId;
      };
    }

    const output = await agent.run(ctx);
    this.addStep(mission, role, "thought", output.summary, output.findings);
    return output;
  }

  private finalizeMission(
    mission: Mission,
    manifestHash: string,
    missionRevision: number,
    consentApproved: boolean
  ) {
    mission.activeAgentId = "auditor";

    // Reale Verifikation der Kette — keine Selbstzertifizierung durch Agenten.
    const chainVerification = this.ledger.verifyChain();
    const receiptVerification = this.receipts.verifyChain();

    // Runner-Level-Abschlussblock mit dem ECHTEN Verifikationsergebnis.
    const finalBlock = this.ledger.seal({
      agentId: "auditor",
      claim: FINALIZE_CLAIM,
      payload: {
        evidenceType: "system_trace",
        missionId: mission.id,
        missionRevision,
        consentApproved,
        chainVerification,
        receiptVerification,
      },
      manifestHash,
      missionRevision,
    });
    this.receipts.issueReceipt({
      missionId: mission.id,
      missionRevision,
      manifestHash,
      payloadHash: finalBlock.payloadHash,
      createdBy: "auditor",
    });
    this.addStep(
      mission,
      "auditor",
      "evidence_sealed",
      `Sealed Evidence Block #${finalBlock.blockIndex} [SHA256: ${finalBlock.blockHash.slice(0, 16)}...]`,
      undefined,
      finalBlock.blockHash
    );

    // Judge-Urteil ueber die reale Evidence + Receipts (reine Funktion).
    const judgeVerdict: VerdictRecord = Judge.judge(
      FINALIZE_CLAIM,
      this.ledger.getChain(),
      this.receipts.exportReceipts()
    );

    const lastBlock = this.ledger.getChain().at(-1);
    const recommendations: string[] = [];
    if (!chainVerification.isValid) {
      recommendations.push(`Evidence chain broken at block ${chainVerification.brokenAt} — investigate before any downstream use.`);
    }
    if (!receiptVerification.isValid) {
      recommendations.push(`Receipt chain broken at receipt ${receiptVerification.brokenAt}.`);
    }
    if (judgeVerdict.verdict === "BLOCKED_BY_MISSING_EVIDENCE") {
      recommendations.push("Judge reports missing evidence — mission outcome is not verifiable.");
    }
    if (judgeVerdict.verdict === "CONTRADICTED") {
      recommendations.push("Judge reports contradictory evidence — manual review required.");
    }
    if (!consentApproved) {
      recommendations.push("Mission was aborted by operator consent rejection.");
    }
    if (recommendations.length === 0) {
      recommendations.push("Evidence chain and receipts verify cleanly; no anomalies detected.");
    }

    mission.finalVerdict = {
      summary: consentApproved
        ? `Mission '${mission.title}' abgeschlossen. Judge-Urteil ueber die reale Evidence: ${judgeVerdict.verdict}. ${judgeVerdict.rationale}`
        : `Mission '${mission.title}' durch Operator-Entscheidung abgebrochen (Consent REJECTED). Judge-Urteil ueber die vorhandene Evidence: ${judgeVerdict.verdict}.`,
      judgeVerdict,
      integrityVerified: chainVerification.isValid && receiptVerification.isValid,
      compliancePassed: chainVerification.isValid && receiptVerification.isValid,
      recommendations,
      chainHashDigest: lastBlock?.blockHash ?? "",
    };

    mission.status = consentApproved ? "completed" : "failed";
    mission.finishedAt = new Date().toISOString();
    mission.evidenceChain = this.ledger.getChain();

    this.addStep(
      mission,
      "operator",
      "message",
      `Mission ${mission.status}: judge verdict ${judgeVerdict.verdict}. Final Chain Digest: ${mission.finalVerdict.chainHashDigest}`
    );
    this.emit("mission_completed", mission);
  }

  private addStep(
    mission: Mission,
    agentId: AgentRole,
    type: ExecutionStep["type"],
    content: string,
    metadata?: Record<string, unknown>,
    evidenceBlockId?: string
  ) {
    const step: ExecutionStep = {
      stepId: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      agentId,
      timestamp: new Date().toISOString(),
      type,
      content,
      metadata,
      evidenceBlockId,
    };
    mission.steps.push(step);
    this.emit("execution_step", step);
    return step;
  }
}

export const fleetRunner = new FleetRunner();
