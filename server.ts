import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { FLEET_AGENTS } from "./server/contracts";
import { evidenceLedger } from "./server/evidenceEngine";
import { consentManager } from "./server/consentEngine";
import { fleetRunner } from "./server/fleetRunner";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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

    // Send initial ping
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
    const chain = evidenceLedger.getChain();
    res.json({ chain, count: chain.length });
  });

  // Verify Chain Integrity
  app.post("/api/evidence/verify", (req, res) => {
    const verification = evidenceLedger.verifyChainIntegrity();
    res.json(verification);
  });

  // Reset Chain
  app.post("/api/evidence/reset", (req, res) => {
    evidenceLedger.resetChain();
    res.json({ success: true, chain: evidenceLedger.getChain() });
  });

  // Get Pending Consent Requests
  app.get("/api/consent/pending", (req, res) => {
    const pending = consentManager.getPendingRequests();
    res.json({ requests: pending });
  });

  // Respond to Consent Request (Approve / Reject)
  app.post("/api/consent/respond", (req, res) => {
    const { requestId, decision, operatorIdentity, reason } = req.body;
    if (!requestId || !decision) {
      return res.status(400).json({ error: "requestId and decision required" });
    }

    const updated = consentManager.respond(requestId, decision, operatorIdentity || "Operator", reason);
    if (!updated) {
      return res.status(404).json({ error: "Consent request not found" });
    }

    res.json({ success: true, request: updated });
  });

  // Telemetry Metrics
  app.get("/api/telemetry", (req, res) => {
    const chain = evidenceLedger.getChain();
    const verification = evidenceLedger.verifyChainIntegrity();
    const allConsents = consentManager.getAllRequests();
    const approvedConsents = allConsents.filter((c) => c.status === "APPROVED");

    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      totalMissionsRun: fleetRunner.getActiveMission() ? 1 : 0,
      totalEvidenceBlocksSealed: chain.length,
      overallConsensusScore: 98.6,
      chainIntegrityValid: verification.isValid,
      activeAgentsCount: FLEET_AGENTS.length,
      consentRequestsPending: consentManager.getPendingRequests().length,
      consentApprovalRate: allConsents.length > 0 ? (approvedConsents.length / allConsents.length) * 100 : 100,
      lastVerifiedBlockHash: chain[chain.length - 1]?.hash || "",
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
