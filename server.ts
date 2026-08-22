import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { FLEET_AGENTS } from "./server/contracts";
import { fleetRunner } from "./server/fleetRunner";
import { Judge, IndependentVerifier } from "./server/evidence/index";
import {
  createUnconfiguredAgentSearchEvidenceProvider,
  groundingStatusSnapshot,
} from "./server/evidence/grounding";
import { createGcpAdapters } from "./server/adapters/gcp/index";
import type { ConsentGrant } from "./src/types/index";
import { OperatorSessionManager } from "./server/security/operatorSession";
import {
  ADK_WIF_CANARY_INTENT,
  GoogleWifCanaryAuthError,
  verifyGoogleWifCanaryAuthority,
} from "./server/security/googleWifCanaryAuth";
import { resolveRuntimePort } from "./server/runtimePort";
import { AdkRuntimeCanaryController } from "./server/adkCanaryController";

async function startServer() {
  const app = express();
  const PORT = resolveRuntimePort(process.env.PORT);

  app.use(express.json());

  const operatorSessions = new OperatorSessionManager(process.env);
  const adkCanary = new AdkRuntimeCanaryController(process.env.PROOFFLEET_SOURCE_REVISION);
  const groundingProvider = createUnconfiguredAgentSearchEvidenceProvider();

  // Letzter echter Verifikationsstand — null solange nie verifiziert wurde.
  let lastVerifiedBlockHash: string | null = null;

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      system: "ProofFleet Verifiable Multi-Agent Platform",
      timestamp: new Date().toISOString(),
      agentCount: FLEET_AGENTS.length,
    });
  });

  // Read-only ADK canary status. This endpoint never triggers a model call.
  app.get("/api/runtime/adk-canary", (_req, res) => {
    res.json(adkCanary.snapshot());
  });

  // Read-only Agent Search evidence status. P0 intentionally wires the honest
  // NOT_CONFIGURED provider only: no Google API call, no credentials and no cost.
  app.get("/api/evidence/grounding/status", async (_req, res) => {
    res.json(await groundingStatusSnapshot(groundingProvider));
  });

  // Trigger exactly one bounded ADK -> Gemini canary for this process.
  // Authority reuses the existing authenticated operator session and a distinct
  // intent header; request bodies cannot provide identity or provider secrets.
  app.post("/api/runtime/adk-canary", async (req, res) => {
    if (req.get("x-prooffleet-canary-intent") !== "1") {
      return res.status(403).json({ error: "canary intent header required" });
    }

    const operator = operatorSessions.authenticate(req.headers.cookie);
    if (!operator.configured) {
      return res.status(503).json({ error: "operator authentication is not provisioned" });
    }
    if (!operator.authenticated || !operator.identity) {
      return res.status(401).json({ error: "authenticated operator session required" });
    }

    const before = adkCanary.snapshot();
    if (!before.eligible) {
      return res.status(409).json({
        error: "adk canary requires an exact runtime source revision",
        canary: before,
      });
    }

    const canary = await adkCanary.trigger();
    if (canary.status === "FAILED") {
      return res.status(502).json({
        error: canary.failureReason ?? "adk_canary_provider_error",
        canary,
      });
    }

    res.json({ success: true, canary });
  });

  // Release-only ADK canary bridge. It accepts no operator credential and has
  // no mission, consent, Firestore, Judge or traffic authority. A caller must
  // present a Google-signed ID token for this exact tagged Cloud Run audience,
  // issued to the already-provisioned ProofFleet deploy WIF service account,
  // plus an exact source-bound release intent. The shared process-local canary
  // controller still guarantees one terminal model attempt per source runtime.
  app.post("/api/runtime/adk-canary/wif", async (req, res) => {
    if (req.get("x-prooffleet-canary-intent") !== ADK_WIF_CANARY_INTENT) {
      return res.status(403).json({ error: "wif canary intent required" });
    }

    const before = adkCanary.snapshot();
    if (!before.eligible || !before.sourceRevision) {
      return res.status(409).json({
        error: "adk canary requires an exact runtime source revision",
        canary: before,
      });
    }

    let authority;
    try {
      authority = await verifyGoogleWifCanaryAuthority({
        authorization: req.get("authorization"),
        host: req.get("host"),
        requestSourceRevision: req.get("x-prooffleet-source-revision"),
        runtimeSourceRevision: before.sourceRevision,
      });
    } catch (error) {
      const code = error instanceof GoogleWifCanaryAuthError
        ? error.code
        : "wif_canary_token_invalid";
      const status = code === "wif_canary_source_mismatch" ? 409 : 401;
      return res.status(status).json({ error: code });
    }

    const canary = await adkCanary.trigger();
    if (canary.status === "FAILED") {
      return res.status(502).json({
        error: canary.failureReason ?? "adk_canary_provider_error",
        canary,
        authority,
      });
    }

    res.json({ success: true, canary, authority });
  });

  // Get Fleet Agents
  app.get("/api/agents", (req, res) => {
    res.json({
      agents: FLEET_AGENTS,
    });
  });

  // Get Current Active Mission
  app.get("/api/fleet/active-mission", (req, res) => {
    const mission = fleetRunner.getActiveMission();
    res.json({ mission });
  });

  // Starting a mission can mutate fleet/evidence/consent state and may spend
  // configured Gemini capacity. Require explicit intent and the same
  // authenticated operator session before startMission can be reached.
  app.post("/api/fleet/run", async (req, res) => {
    if (req.get("x-prooffleet-mission-intent") !== "1") {
      return res.status(403).json({ error: "mission intent header required" });
    }

    const operator = operatorSessions.authenticate(req.headers.cookie);
    if (!operator.configured) {
      return res.status(503).json({ error: "operator authentication is not provisioned" });
    }
    if (!operator.authenticated || !operator.identity) {
      return res.status(401).json({ error: "authenticated operator session required" });
    }

    try {
      const { title, inputGoal, presetKey, strictness, thinkingLevel, requireConsentForWrite } = req.body;
      const mission = await fleetRunner.startMission(
        title,
        inputGoal,
        presetKey,
        strictness,
        thinkingLevel,
        requireConsentForWrite !== false
      );
      res.json({ success: true, mission });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "mission_already_active") {
        return res.status(409).json({ success: false, error: "mission_already_active" });
      }
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : "mission_start_failed",
      });
    }
  });

  // Server-Sent Events (SSE) for Real-Time Execution Stream
  app.get("/api/fleet/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

    const unsubscribe = fleetRunner.subscribe((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", () => {
      unsubscribe();
    });
  });

  // Get Cryptographic Evidence Chain
  app.get("/api/evidence/chain", (req, res) => {
    const chain = fleetRunner.getLedger().getChain();
    res.json({ chain, count: chain.length });
  });

  // Get Chained Evidence Receipts
  app.get("/api/evidence/receipts", (req, res) => {
    const receipts = fleetRunner.getReceiptChain().exportReceipts();
    res.json({ receipts, count: receipts.length });
  });

  // Verify Chain Integrity (independent verifier on read-only snapshots)
  app.post("/api/evidence/verify", (req, res) => {
    const chain = fleetRunner.getLedger().getChain();
    const receipts = fleetRunner.getReceiptChain().exportReceipts();
    const verifier = new IndependentVerifier(chain, receipts);
    const ledgerResult = verifier.verifyLedger();
    const receiptResult = fleetRunner.getReceiptChain().verifyChain(receipts);
    const isValid = ledgerResult.isValid && receiptResult.isValid;
    if (isValid && chain.length > 0) {
      lastVerifiedBlockHash = chain[chain.length - 1].blockHash;
    }
    res.json({
      isValid,
      brokenAt: ledgerResult.brokenAt ?? receiptResult.brokenAt,
      totalBlocks: chain.length,
      totalReceipts: receipts.length,
      unauthenticatedBlocks: ledgerResult.unauthenticatedBlocks,
      details: isValid
        ? `All ${chain.length} evidence blocks and ${receipts.length} receipts recompute and link correctly.`
        : "Integrity check FAILED — see brokenAt/invalidBlocks.",
      invalidBlocks: ledgerResult.invalidBlocks,
    });
  });

  // Evidence reset is a destructive truth-path mutation. It requires both a
  // deliberate reset intent and the same authenticated operator authority used
  // by other privileged runtime mutations. Active mission ownership is a hard
  // exclusion boundary: resetting underneath a running/paused pipeline would
  // let background execution write into a new truth state.
  app.post("/api/evidence/reset", (req, res) => {
    if (req.get("x-prooffleet-evidence-reset-intent") !== "1") {
      return res.status(403).json({ error: "evidence reset intent header required" });
    }

    const operator = operatorSessions.authenticate(req.headers.cookie);
    if (!operator.configured) {
      return res.status(503).json({ error: "operator authentication is not provisioned" });
    }
    if (!operator.authenticated || !operator.identity) {
      return res.status(401).json({ error: "authenticated operator session required" });
    }

    const activeMission = fleetRunner.getActiveMission();
    if (
      activeMission &&
      (activeMission.status === "running" || activeMission.status === "paused_for_consent")
    ) {
      return res.status(409).json({ error: "mission_active_reset_blocked" });
    }

    fleetRunner.resetEvidence();
    fleetRunner.getConsentEngine().clearRequests();
    lastVerifiedBlockHash = null;
    res.json({
      success: true,
      operatorIdentity: operator.identity,
      chain: fleetRunner.getLedger().getChain(),
    });
  });

  // Judge: read-only evaluation of a claim against real evidence + receipts
  app.post("/api/judge/evaluate", (req, res) => {
    const { claim } = req.body ?? {};
    if (typeof claim !== "string" || claim.length === 0) {
      return res.status(400).json({ error: "claim (string) required" });
    }
    const verdict = Judge.judge(
      claim,
      fleetRunner.getLedger().getChain(),
      fleetRunner.getReceiptChain().exportReceipts()
    );
    res.json({ verdict });
  });

  // GCP Integration Status — honest provisioning status, no simulation
  app.get("/api/integrations/status", async (req, res) => {
    const adapters = createGcpAdapters(process.env);
    const statuses = await Promise.all(
      adapters.map(async (a) => ({ service: a.service, ...(await a.status()) }))
    );
    res.json({ integrations: statuses });
  });

  // Operator session: short-lived, HttpOnly, server-authenticated identity.
  app.get("/api/operator/session", (req, res) => {
    const state = operatorSessions.authenticate(req.headers.cookie);
    res.json({
      configured: state.configured,
      authenticated: state.authenticated,
      identity: state.authenticated ? state.identity : null,
      reason: state.authenticated ? undefined : state.reason,
    });
  });

  app.post("/api/operator/session", (req, res) => {
    const result = operatorSessions.createSession(req.body?.token);
    if (result.ok === false) {
      return res.status(result.status).json({ error: result.reason });
    }
    res.setHeader("Set-Cookie", result.setCookie);
    res.json({
      success: true,
      authenticated: true,
      identity: result.identity,
      expiresAt: result.expiresAt,
    });
  });

  // Get Pending Consent Requests
  app.get("/api/consent/pending", (req, res) => {
    const pending = fleetRunner.getConsentEngine().getPendingRequests();
    res.json({ requests: pending });
  });

  // Respond to Consent Request (Approve / Reject). The operator identity comes
  // ONLY from the authenticated HttpOnly session; request bodies cannot forge it.
  app.post("/api/consent/respond", async (req, res) => {
    if (req.get("x-prooffleet-consent-intent") !== "1") {
      return res.status(403).json({ error: "consent intent header required" });
    }

    const operator = operatorSessions.authenticate(req.headers.cookie);
    if (!operator.configured) {
      return res.status(503).json({ error: "operator authentication is not provisioned" });
    }
    if (!operator.authenticated || !operator.identity) {
      return res.status(401).json({ error: "authenticated operator session required" });
    }

    const { requestId, decision, reason } = req.body ?? {};
    if (!requestId || !decision) {
      return res.status(400).json({ error: "requestId and decision required" });
    }
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return res.status(400).json({ error: "decision must be APPROVED or REJECTED" });
    }

    const grant: ConsentGrant | null = fleetRunner
      .getConsentEngine()
      .respond(requestId, decision, operator.identity, reason);
    if (!grant) {
      return res.status(404).json({ error: "Consent request not found or already decided" });
    }

    const mission = await fleetRunner.resumeWithGrant(grant);
    res.json({ success: true, grant, mission });
  });

  // Telemetry Metrics — nur echte Werte; unbekannte Werte sind ehrlich null.
  app.get("/api/telemetry", (req, res) => {
    const chain = fleetRunner.getLedger().getChain();
    const verification = fleetRunner.getLedger().verifyChain();
    const allConsents = fleetRunner.getConsentEngine().getAllRequests();
    const decided = allConsents.filter((c) => c.status === "APPROVED" || c.status === "REJECTED");
    const approvedConsents = allConsents.filter((c) => c.status === "APPROVED");

    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      totalMissionsRun: fleetRunner.getMissionsRun(),
      totalEvidenceBlocksSealed: chain.length,
      chainIntegrityValid: verification.isValid,
      activeAgentsCount: FLEET_AGENTS.length,
      consentRequestsPending: fleetRunner.getConsentEngine().getPendingRequests().length,
      consentApprovalRate:
        decided.length > 0 ? (approvedConsents.length / decided.length) * 100 : null,
      lastVerifiedBlockHash,
    });
  });

  // Vite middleware for development vs static in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ProofFleet Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
