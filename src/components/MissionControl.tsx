import React, { useState } from "react";
import { Play, Sparkles, Sliders, ShieldCheck, Lock, RotateCcw } from "lucide-react";
import { Mission } from "../types";

interface MissionControlProps {
  onRunMission: (params: {
    title: string;
    inputGoal: string;
    presetKey: Mission["presetKey"];
    strictness: Mission["strictness"];
    thinkingLevel: Mission["thinkingLevel"];
    requireConsentForWrite: boolean;
  }) => void;
  isRunning: boolean;
  onResetChain: () => void;
  canResetChain: boolean;
}

export const MissionControl: React.FC<MissionControlProps> = ({
  onRunMission,
  isRunning,
  onResetChain,
  canResetChain,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<Mission["presetKey"]>("security_audit");
  const [customGoal, setCustomGoal] = useState<string>(
    "Perform a full zero-trust security audit on our agent communication protocol, verify evidence hash integrity, and simulate human consent for production promotion."
  );
  const [strictness, setStrictness] = useState<Mission["strictness"]>("high_assurance");
  const [thinkingLevel, setThinkingLevel] = useState<Mission["thinkingLevel"]>("HIGH");
  const [requireConsent, setRequireConsent] = useState<boolean>(true);

  const presets = [
    {
      key: "security_audit" as const,
      title: "Zero-Trust Security & Compliance Audit",
      desc: "Sentinel & Gatekeeper audit multi-agent communication, verify least-privilege tokens, and seal SHA-256 evidence.",
      goal: "Perform a full zero-trust security audit on our agent communication protocol, verify evidence hash integrity, and simulate human consent for production promotion.",
    },
    {
      key: "market_intel" as const,
      title: "Grounded Market & AI Architecture Intelligence",
      desc: "Scout retrieves citations; Analyst validates reasoning; Auditor seals verifiable claims.",
      goal: "Extract and verify grounded architectural benchmarks for Google Cloud multi-agent systems with NIST AI RMF compliance citations.",
    },
    {
      key: "code_deploy" as const,
      title: "Critical Code & Cloud Deployment Gate",
      desc: "Builder designs code; Sentinel scans for secrets; Gatekeeper intercepts write action for Human Consent.",
      goal: "Synthesize and validate a secure Cloud Run agent deployment manifest, scan for secret exposures, and obtain explicit operator consent.",
    },
    {
      key: "custom" as const,
      title: "Custom Multi-Agent Mission",
      desc: "Define your own autonomous objective for the 8 core agents to execute and verify.",
      goal: "",
    },
  ];

  const handleSelectPreset = (preset: typeof presets[0]) => {
    setSelectedPreset(preset.key);
    if (preset.key !== "custom") {
      setCustomGoal(preset.goal);
    }
  };

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGoal.trim() || isRunning) return;

    const presetObj = presets.find((p) => p.key === selectedPreset);
    const title = presetObj?.title || "Custom Multi-Agent Mission";

    onRunMission({
      title,
      inputGoal: customGoal,
      presetKey: selectedPreset,
      strictness,
      thinkingLevel,
      requireConsentForWrite: requireConsent,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            Mission Control
          </h2>
          <p className="text-xs text-slate-500">
            Dispatch verifiable tasks across the 8-agent substrate
          </p>
        </div>

        <button
          type="button"
          onClick={onResetChain}
          disabled={isRunning || !canResetChain}
          className="self-start sm:self-auto flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          title={canResetChain ? "Reset Evidence Chain to Genesis Block" : "Authenticated operator session required to reset evidence"}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Ledger</span>
        </button>
      </div>

      {/* Preset Selector Chips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-4">
        {presets.slice(0, 3).map((p) => {
          const isSelected = selectedPreset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handleSelectPreset(p)}
              className={`text-left p-3 rounded-xl border transition-all ${
                isSelected
                  ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500/30"
                  : "border-slate-200 bg-slate-50/30 hover:border-slate-300 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-900">
                  {p.title}
                </span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                )}
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">
                {p.desc}
              </p>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleLaunch} className="space-y-4">
        {/* Goal Input Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Mission Objective / Goal Prompt
          </label>
          <textarea
            rows={2}
            value={customGoal}
            onChange={(e) => {
              setCustomGoal(e.target.value);
              setSelectedPreset("custom");
            }}
            placeholder="Type the autonomous mission objective for ProofFleet..."
            className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none bg-slate-50/40 focus:bg-white text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {/* Parameter Controls Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
          {/* Strictness */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Assurance Strictness
            </label>
            <select
              value={strictness}
              onChange={(e) => setStrictness(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:border-blue-500 outline-none"
            >
              <option value="standard">Standard Assurance (90%+)</option>
              <option value="high_assurance">High Assurance (98%+)</option>
              <option value="military_grade">Zero-Trust Formal Proof</option>
            </select>
          </div>

          {/* Thinking Level */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Gemini Reasoning Depth
            </label>
            <select
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as any)}
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:border-blue-500 outline-none"
            >
              <option value="HIGH">ThinkingLevel.HIGH (Deep Reasoning)</option>
              <option value="LOW">ThinkingLevel.LOW (Low Latency)</option>
            </select>
          </div>

          {/* Consent Mode */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Human Consent Gate
            </label>
            <button
              type="button"
              onClick={() => setRequireConsent(!requireConsent)}
              className={`w-full text-xs px-2.5 py-1.5 rounded-lg border flex items-center justify-between font-medium transition-colors ${
                requireConsent
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : "bg-slate-100 border-slate-200 text-slate-600"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                {requireConsent ? "Gatekeeper Required" : "Autonomous Pass"}
              </span>
              <span className="text-[10px] uppercase font-bold">
                {requireConsent ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </div>

        {/* Launch Button */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isRunning || !customGoal.trim()}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white shadow-md transition-all ${
              isRunning
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-blue-500/20"
            }`}
          >
            <Play className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
            <span>{isRunning ? "Executing Multi-Agent Mission..." : "Execute Verifiable Mission"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
