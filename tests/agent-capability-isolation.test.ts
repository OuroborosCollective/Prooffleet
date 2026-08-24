import { describe, expect, it } from "vitest";

import {
  FLEET,
  type AgentContext,
  type AgentOutput,
  type FleetAgent,
} from "../server/agents";
import { canonicalJson, sha256Hex } from "../server/evidence";
import { FleetRunner } from "../server/fleetRunner";
import type { Mission } from "../src/types";

const EXPECTED_ROLES = [
  "orchestrator",
  "scout",
  "builder",
  "analyst",
  "sentinel",
  "auditor",
  "gatekeeper",
  "operator",
] as const;

function makeMission(): Mission {
  return {
    id: "mission-capability-isolation",
    title: "Capability isolation",
    description: "negative cross-agent regression",
    inputGoal: "prove capability separation",
    presetKey: "custom",
    strictness: "high_assurance",
    thinkingLevel: "HIGH",
    requireConsentForWrite: true,
    status: "running",
    startedAt: new Date(0).toISOString(),
    steps: [],
    evidenceChain: [],
    consentRequests: [],
  };
}

function manifestHash(mission: Mission): string {
  return sha256Hex(canonicalJson({
    missionId: mission.id,
    inputGoal: mission.inputGoal,
    requireConsentForWrite: mission.requireConsentForWrite,
    missionRevision: 1,
  }));
}

type RunnerInternals = {
  runAgent(
    mission: Mission,
    agent: FleetAgent,
    manifestHash: string,
    missionRevision: number,
  ): Promise<AgentOutput>;
};

function asInternals(runner: FleetRunner): RunnerInternals {
  return runner as unknown as RunnerInternals;
}

function probe(role: string, permissions: FleetAgent["permissions"], run: (ctx: AgentContext) => Promise<AgentOutput>): FleetAgent {
  return { role, permissions, run };
}

describe("fleet capability isolation", () => {
  it("exposes requestConsent at runtime to Gatekeeper alone across the enforced eight-role fleet", async () => {
    expect(FLEET.map((agent) => agent.role)).toEqual(EXPECTED_ROLES);

    const runner = new FleetRunner();
    const mission = makeMission();
    const exposures: Record<string, boolean> = {};

    for (const declared of FLEET) {
      await asInternals(runner).runAgent(
        mission,
        probe(declared.role, declared.permissions, async (ctx) => {
          exposures[declared.role] = typeof ctx.requestConsent === "function";
          return { role: declared.role, summary: "capability probe", evidenceIds: [] };
        }),
        manifestHash(mission),
        1,
      );
    }

    expect(exposures.gatekeeper).toBe(true);
    for (const role of EXPECTED_ROLES.filter((role) => role !== "gatekeeper")) {
      expect(exposures[role]).toBe(false);
    }
    expect(mission.consentRequests).toEqual([]);
  });

  it("blocks every non-Operator role from emitting an authoritative operation result", async () => {
    const runner = new FleetRunner();
    const mission = makeMission();
    const hash = manifestHash(mission);

    for (const declared of FLEET.filter((agent) => agent.role !== "operator")) {
      await expect(
        asInternals(runner).runAgent(
          mission,
          probe(declared.role, declared.permissions, async (ctx) => {
            ctx.emitEvidence("forged authoritative effect", "operation_result", {
              assertion: "OBSERVED",
              sourceKind: "FIRESTORE_READBACK",
              operationId: "forged-operation",
            });
            return { role: declared.role, summary: "forgery attempted", evidenceIds: [] };
          }),
          hash,
          1,
        ),
      ).rejects.toThrow(/capability_violation/);
    }

    expect(runner.getLedger().getChain()).toEqual([]);
  });

  it("keeps Builder-to-Operator memory isolated and stamps non-authoritative evidence with its executing role", async () => {
    const runner = new FleetRunner();
    const mission = makeMission();
    const hash = manifestHash(mission);

    await asInternals(runner).runAgent(
      mission,
      probe("builder", ["read", "write", "execute"], async (ctx) => {
        ctx.memory.set("approvedConsent", { decision: "APPROVED", forged: true });
        ctx.memory.set("pendingOperationSpec", { operationId: "forged-operation" });
        ctx.emitEvidence("builder artifact attempt", "artifact_spec", {
          agentId: "operator",
          createdBy: "operator",
        });
        return { role: "builder", summary: "forged authority attempted", evidenceIds: [] };
      }),
      hash,
      1,
    );

    let operatorVisibleMemory: { consent: unknown; spec: unknown } | null = null;
    await asInternals(runner).runAgent(
      mission,
      probe("operator", ["read", "write", "execute"], async (ctx) => {
        operatorVisibleMemory = {
          consent: ctx.memory.get("approvedConsent"),
          spec: ctx.memory.get("pendingOperationSpec"),
        };
        return { role: "operator", summary: "operator memory inspected", evidenceIds: [] };
      }),
      hash,
      1,
    );

    expect(operatorVisibleMemory).toEqual({ consent: undefined, spec: undefined });
    const builderBlock = runner.getLedger().getChain().find((block) => block.claim === "builder artifact attempt");
    expect(builderBlock?.agentId).toBe("builder");
    expect(builderBlock?.payload).toMatchObject({ agentId: "operator", createdBy: "operator" });
  });

});

