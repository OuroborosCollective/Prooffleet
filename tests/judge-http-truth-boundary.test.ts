import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "../server.ts"), "utf8");

describe("public Judge truth boundary", () => {
  it("exposes only the server-owned canonical final verdict", () => {
    const start = server.indexOf('app.post("/api/judge/evaluate"');
    const end = server.indexOf('// GCP Integration Status', start);
    const route = server.slice(start, end);

    expect(route).toContain('claim !== "mission finalized"');
    expect(route).toContain('canonical final verdict only');
    expect(route).toContain('canonical final verdict unavailable');
    expect(route).toContain('mission.finalVerdict.judgeVerdict');
    expect(route).not.toContain("Judge.judge(");
    expect(route).not.toContain("requirements");
  });

  it("keeps proof-requirement derivation inside the FleetRunner-owned path", () => {
    expect(server).not.toContain('import { Judge, IndependentVerifier }');
    expect(server).toContain('fleetRunner.getActiveMission()');
  });
});
