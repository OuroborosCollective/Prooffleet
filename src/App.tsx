import React, { useEffect, useState } from "react";
import { Navbar } from "./components/Navbar";
import { AgentFleetGrid } from "./components/AgentFleetGrid";
import { MissionControl } from "./components/MissionControl";
import { LiveExecutionStream } from "./components/LiveExecutionStream";
import { EvidenceChainLedger } from "./components/EvidenceChainLedger";
import { ConsentGateModal } from "./components/ConsentGateModal";
import { TruthVerificationReport } from "./components/TruthVerificationReport";
import { MissionAnalytics } from "./components/MissionAnalytics";
import {
  AgentContract,
  Mission,
  EvidenceBlock,
  ConsentRequest,
  FleetTelemetry,
} from "./types";

export default function App() {
  const [agents, setAgents] = useState<AgentContract[]>([]);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [evidenceChain, setEvidenceChain] = useState<EvidenceBlock[]>([]);
  const [pendingConsent, setPendingConsent] = useState<ConsentRequest | null>(null);
  const [telemetry, setTelemetry] = useState<FleetTelemetry | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    details: string;
  } | null>(null);

  // Fetch initial fleet agents and telemetry
  const fetchFleetData = async () => {
    try {
      const [agentsRes, missionRes, chainRes, telemetryRes, consentRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/fleet/active-mission"),
        fetch("/api/evidence/chain"),
        fetch("/api/telemetry"),
        fetch("/api/consent/pending"),
      ]);

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }

      if (missionRes.ok) {
        const data = await missionRes.json();
        if (data.mission) setActiveMission(data.mission);
      }

      if (chainRes.ok) {
        const data = await chainRes.json();
        setEvidenceChain(data.chain || []);
      }

      if (telemetryRes.ok) {
        const data = await telemetryRes.json();
        setTelemetry(data);
      }

      if (consentRes.ok) {
        const data = await consentRes.json();
        if (data.requests && data.requests.length > 0) {
          setPendingConsent(data.requests[0]);
        } else {
          setPendingConsent(null);
        }
      }
    } catch (err) {
      console.error("Error fetching fleet data:", err);
    }
  };

  useEffect(() => {
    fetchFleetData();

    // Subscribe to SSE stream for live events
    const eventSource = new EventSource("/api/fleet/stream");

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === "execution_step") {
          setActiveMission((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              steps: [...prev.steps, parsed.data],
            };
          });
        } else if (parsed.type === "mission_started") {
          setActiveMission(parsed.data);
          setPendingConsent(null);
        } else if (parsed.type === "mission_completed") {
          setActiveMission(parsed.data);
          fetchFleetData();
        } else if (parsed.type === "consent_requested") {
          setPendingConsent(parsed.data);
        }
      } catch (e) {
        console.error("Error parsing SSE event:", e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    const interval = setInterval(fetchFleetData, 4000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, []);

  // Run Mission handler
  const handleRunMission = async (params: {
    title: string;
    inputGoal: string;
    presetKey: Mission["presetKey"];
    strictness: Mission["strictness"];
    thinkingLevel: Mission["thinkingLevel"];
    requireConsentForWrite: boolean;
  }) => {
    try {
      setVerificationResult(null);
      const res = await fetch("/api/fleet/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (data.success && data.mission) {
        setActiveMission(data.mission);
        fetchFleetData();
      }
    } catch (err) {
      console.error("Failed to run mission:", err);
    }
  };

  // Verify Chain Integrity handler
  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch("/api/evidence/verify", { method: "POST" });
      const data = await res.json();
      setVerificationResult(data);
      fetchFleetData();
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setIsVerifying(false);
    }
  };

  // Reset Chain handler
  const handleResetChain = async () => {
    try {
      await fetch("/api/evidence/reset", { method: "POST" });
      setVerificationResult(null);
      setActiveMission(null);
      fetchFleetData();
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  // Respond to Consent handler
  const handleConsentRespond = async (
    decision: "APPROVED" | "REJECTED",
    reason?: string
  ) => {
    if (!pendingConsent) return;
    setIsSubmittingConsent(true);

    try {
      await fetch("/api/consent/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: pendingConsent.requestId,
          decision,
          operatorIdentity: "Operator",
          reason,
        }),
      });

      setPendingConsent(null);
      fetchFleetData();
    } catch (err) {
      console.error("Consent response failed:", err);
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  const isRunning = activeMission?.status === "running";

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      <Navbar
        telemetry={telemetry}
        isConnected={isConnected}
        onVerifyChain={handleVerifyChain}
        isVerifying={isVerifying}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top 8 Agents Grid */}
        <AgentFleetGrid
          agents={agents}
          activeAgentId={activeMission?.activeAgentId}
          evidenceChain={evidenceChain}
        />

        {/* Mission Control Panel */}
        <MissionControl
          onRunMission={handleRunMission}
          isRunning={isRunning}
          onResetChain={handleResetChain}
        />

        {/* Audit Report Banner if completed */}
        {activeMission?.finalVerdict && (
          <TruthVerificationReport mission={activeMission} />
        )}

        {/* Mission Analytics Charts */}
        <MissionAnalytics totalMissionsRun={telemetry?.totalMissionsRun ?? 0} />

        {/* Execution Stream + Evidence Ledger Side-by-Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[460px]">
          <LiveExecutionStream
            steps={activeMission?.steps || []}
            activeAgentId={activeMission?.activeAgentId}
            isRunning={isRunning}
          />

          <EvidenceChainLedger
            chain={evidenceChain}
            onVerifyChain={handleVerifyChain}
            isVerifying={isVerifying}
            integrityResult={verificationResult}
          />
        </div>
      </main>

      {/* Human Consent Modal */}
      <ConsentGateModal
        request={pendingConsent}
        onRespond={handleConsentRespond}
        isSubmitting={isSubmittingConsent}
      />
    </div>
  );
}
