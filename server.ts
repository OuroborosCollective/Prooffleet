import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { FLEET_AGENTS } from "./server/contracts";
import { fleetRunner } from "./server/fleetRunner";
import { Judge, IndependentVerifier } from "./server/evidence/index";
import { createGcpAdapters } from "./server/adapters/gcp/index";
import type { ConsentGrant } from "./src/types/index";
import { OperatorSessionManager } from "./server/security/operatorSession";
import { resolveRuntimePort } from "./server/runtimePort";

async function startServer() {
  const app = express();
  const PORT = resolveRuntimePort(process.env.PORT);

  app.use(express.json());

  const operatorSessions = new OperatorSessionManager(process.env);

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

  // Trigger New Mission
  app.post("/api/fleet/run", async (req, res) => {
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
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
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

  // Reset Chain
  app.post("/api/evidence/reset", (req, res) => {
    fleetRunner.resetEvidence();
    lastVerifiedBlockHash = null;
    res.json({ success: true, chain: fleetRunner.getLedger().getChain() });
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
