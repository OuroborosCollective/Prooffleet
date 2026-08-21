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
  AdkRuntimeCanaryPanel,
  type AdkCanarySnapshot,
} from "./components/AdkRuntimeCanaryPanel";
import {
  GroundingEvidencePanel,
  type GroundingStatusSnapshot,
} from "./components/GroundingEvidencePanel";
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
  const [adkCanary, setAdkCanary] = useState<AdkCanarySnapshot | null>(null);
  const [groundingStatus, setGroundingStatus] = useState<GroundingStatusSnapshot | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isSubmittingConsent, setIsSubmittingConsent] = useState<boolean>(false);
  const [isAuthenticatingOperator, setIsAuthenticatingOperator] = useState<boolean>(false);
  const [isRunningAdkCanary, setIsRunningAdkCanary] = useState<boolean>(false);
  const [operatorAuthError, setOperatorAuthError] = useState<string | null>(null);
  const [adkCanaryError, setAdkCanaryError] = useState<string | null>(null);
  const [operatorSession, setOperatorSession] = useState<{
    configured: boolean;
    authenticated: boolean;
    identity: string | null;
  }>({ configured: false, authenticated: false, identity: null });
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    details: string;
  } | null>(null);

  const fetchFleetData = async () => {
    try {
      const [
        agentsRes,
        missionRes,
        chainRes,
        telemetryRes,
        consentRes,
        operatorSessionRes,
        adkCanaryRes,
        groundingStatusRes,
      ] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/fleet/active-mission"),
        fetch("/api/evidence/chain"),
        fetch("/api/telemetry"),
        fetch("/api/consent/pending"),
        fetch("/api/operator/session"),
        fetch("/api/runtime/adk-canary"),
        fetch("/api/evidence/grounding/status"),
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

      if (operatorSessionRes.ok) {
        const data = await operatorSessionRes.json();
        setOperatorSession({
          configured: data.configured === true,
          authenticated: data.authenticated === true,
          identity: typeof data.identity === "string" ? data.identity : null,
        });
      }

      if (adkCanaryRes.ok) {
        const data = (await adkCanaryRes.json()) as AdkCanarySnapshot;
        setAdkCanary(data);
      }

      if (groundingStatusRes.ok) {
        const data = (await groundingStatusRes.json()) as GroundingStatusSnapshot;
        setGroundingStatus(data);
      }
    } catch (err) {
      console.error("Error fetching fleet data:", err);
    }
  };

  useEffect(() => {
    fetchFleetData();

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

  const handleRunMission = async (params: {
    title: string;
    inputGoal: string;
    presetKey: Mission["presetKey"];
    strictness: Mission["strictness"];
    thinkingLevel: Mission["thinkingLevel"];
    requireConsentForWrite: boolean;
  }) => {
    setOperatorAuthError(null);
    try {
      const res = await fetch("/api/fleet/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ProofFleet-Mission-Intent": "1",
        },
        credentials: "same-origin",
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok || data.success !== true || !data.mission) {
        if (res.status === 401) {
          setOperatorSession((prev) => ({ ...prev, authenticated: false, identity: null }));
        } else if (res.status === 503) {
          setOperatorSession({ configured: false, authenticated: false, identity: null });
        }
        setOperatorAuthError(data.error || "Mission start failed closed.");
        return;
      }

      setVerificationResult(null);
      setActiveMission(data.mission);
      void fetchFleetData();
    } catch (err) {
      console.error("Failed to run mission:", err);
      setOperatorAuthError("Mission start request failed.");
    }
  };

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

  const handleResetChain = async () => {
    try {
      const res = await fetch("/api/evidence/reset", {
        method: "POST",
        headers: {
          "X-ProofFleet-Evidence-Reset-Intent": "1",
        },
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok || data.success !== true) {
        if (res.status === 401) {
          setOperatorSession((prev) => ({ ...prev, authenticated: false, identity: null }));
        } else if (res.status === 503) {
          setOperatorSession({ configured: false, authenticated: false, identity: null });
        }
        setOperatorAuthError(data.error || "Evidence reset failed closed.");
        return;
      }

      setOperatorAuthError(null);
      setVerificationResult(null);
      setActiveMission(null);
      await fetchFleetData();
    } catch (err) {
      console.error("Reset failed:", err);
      setOperatorAuthError("Evidence reset request failed.");
    }
  };

  const handleOperatorAuthenticate = async (token: string) => {
    setIsAuthenticatingOperator(true);
    setOperatorAuthError(null);
    try {
      const res = await fetch("/api/operator/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || data.authenticated !== true) {
        setOperatorAuthError(data.error || "Operator authentication failed.");
        return false;
      }
      setOperatorSession({ configured: true, authenticated: true, identity: data.identity || null });
      setAdkCanaryError(null);
      return true;
    } catch (err) {
      console.error("Operator authentication failed:", err);
      setOperatorAuthError("Operator authentication request failed.");
      return false;
    } finally {
      setIsAuthenticatingOperator(false);
    }
  };

  const handleRunAdkCanary = async () => {
    setIsRunningAdkCanary(true);
    setAdkCanaryError(null);
    try {
      const res = await fetch("/api/runtime/adk-canary", {
        method: "POST",
        headers: {
          "X-ProofFleet-Canary-Intent": "1",
        },
        credentials: "same-origin",
      });
      const data = await res.json();

      if (data.canary) {
        setAdkCanary(data.canary as AdkCanarySnapshot);
      }

      if (!res.ok || data.success !== true) {
        if (res.status === 401) {
          setOperatorSession((prev) => ({ ...prev, authenticated: false, identity: null }));
        } else if (res.status === 503) {
          setOperatorSession({ configured: false, authenticated: false, identity: null });
        }
        setAdkCanaryError(data.error || "ADK live canary failed closed.");
        return;
      }

      setAdkCanaryError(null);
    } catch (err) {
      console.error("ADK live canary request failed:", err);
      setAdkCanaryError("ADK live canary request failed.");
    } finally {
      setIsRunningAdkCanary(false);
      void fetchFleetData();
    }
  };

  const handleConsentRespond = async (
    decision: "APPROVED" | "REJECTED",
    reason?: string
  ) => {
    if (!pendingConsent) return;
    setIsSubmittingConsent(true);

    try {
      const res = await fetch("/api/consent/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ProofFleet-Consent-Intent": "1",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          requestId: pendingConsent.requestId,
          decision,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setOperatorSession((prev) => ({ ...prev, authenticated: false, identity: null }));
        }
        setOperatorAuthError(data.error || "Consent response failed.");
        return;
      }

      setPendingConsent(null);
      setOperatorAuthError(null);
      fetchFleetData();
    } catch (err) {
      console.error("Consent response failed:", err);
    } finally {
      setIsSubmittingConsent(false);
    }
  };

  const isRunning = activeMission?.status === "running";
  const missionActive =
    activeMission?.status === "running" || activeMission?.status === "paused_for_consent";

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans">
      <Navbar
        telemetry={telemetry}
        isConnected={isConnected}
        onVerifyChain={handleVerifyChain}
        isVerifying={isVerifying}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <AgentFleetGrid
          agents={agents}
          activeAgentId={activeMission?.activeAgentId}
          evidenceChain={evidenceChain}
        />

        <MissionControl
          onRunMission={handleRunMission}
          isRunning={missionActive}
          onResetChain={handleResetChain}
          canResetChain={operatorSession.configured && operatorSession.authenticated}
        />

        <AdkRuntimeCanaryPanel
          canary={adkCanary}
          operatorConfigured={operatorSession.configured}
          operatorAuthenticated={operatorSession.authenticated}
          operatorIdentity={operatorSession.identity}
          isAuthenticating={isAuthenticatingOperator}
          authError={operatorAuthError}
          isRunningCanary={isRunningAdkCanary}
          canaryError={adkCanaryError}
          onAuthenticate={handleOperatorAuthenticate}
          onRunCanary={handleRunAdkCanary}
        />

        <GroundingEvidencePanel snapshot={groundingStatus} />

        {activeMission?.finalVerdict && (
          <TruthVerificationReport mission={activeMission} />
        )}

        <MissionAnalytics totalMissionsRun={telemetry?.totalMissionsRun ?? 0} />

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

      <ConsentGateModal
        request={pendingConsent}
        onRespond={handleConsentRespond}
        isSubmitting={isSubmittingConsent}
        operatorConfigured={operatorSession.configured}
        operatorAuthenticated={operatorSession.authenticated}
        operatorIdentity={operatorSession.identity}
        onAuthenticate={handleOperatorAuthenticate}
        isAuthenticating={isAuthenticatingOperator}
        authError={operatorAuthError}
      />
    </div>
  );
}
