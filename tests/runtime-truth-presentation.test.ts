import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveChainTruthPresentation } from "../src/components/runtimeTruthPresentation";

const here = dirname(fileURLToPath(import.meta.url));
const navbar = readFileSync(join(here, "../src/components/Navbar.tsx"), "utf8");
const fleetGrid = readFileSync(join(here, "../src/components/AgentFleetGrid.tsx"), "utf8");

describe("frontend runtime truth projection", () => {
  it("never presents a hash-consistent empty ledger as a verified chain", () => {
    expect(deriveChainTruthPresentation(0, true)).toMatchObject({
      tone: "neutral",
      isVerified: false,
      label: "No evidence chain",
    });
  });

  it("keeps missing or negative integrity readback out of green", () => {
    expect(deriveChainTruthPresentation(3, undefined)).toMatchObject({
      tone: "unverified",
      isVerified: false,
    });
    expect(deriveChainTruthPresentation(3, false)).toMatchObject({
      tone: "unverified",
      isVerified: false,
    });
  });

  it("uses verified presentation only for non-empty passing evidence", () => {
    expect(deriveChainTruthPresentation(1, true)).toMatchObject({
      tone: "verified",
      isVerified: true,
      label: "Chain integrity intact (SHA-256)",
    });
  });

  it("wires empty-chain and idle-agent states to neutral rather than health claims", () => {
    expect(navbar).toContain("deriveChainTruthPresentation(");
    expect(navbar).not.toContain('telemetry?.chainIntegrityValid\n                ? "Chain Verified (SHA-256)"');
    expect(fleetGrid).toContain('label: "Idle"');
    expect(fleetGrid).toContain("No live runtime health assertion");
    expect(fleetGrid).not.toContain('label: "Healthy"');
    expect(fleetGrid).not.toContain("Contract Verified");
    expect(fleetGrid).not.toContain("8 Optimal");
  });

  it("keeps declared-agent display separate from actual runtime health and supports fleet role names", () => {
    expect(fleetGrid).toContain("{agents.length} Declared");
    expect(fleetGrid).toContain('case "scout":');
    expect(fleetGrid).toContain('case "builder":');
    expect(fleetGrid).not.toContain("Continuity Linked");
  });
});
