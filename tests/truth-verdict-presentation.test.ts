import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveTruthVerdictPresentation } from "../src/components/truthVerdictPresentation";

const here = dirname(fileURLToPath(import.meta.url));
const report = readFileSync(join(here, "../src/components/TruthVerificationReport.tsx"), "utf8");

describe("frontend truth verdict projection", () => {
  it("shows green VERIFIED only when Judge, integrity, and policy all pass", () => {
    expect(deriveTruthVerdictPresentation("VERIFIED", true, true)).toMatchObject({
      status: "VERIFIED",
      tone: "verified",
      isVerified: true,
    });
  });

  it("keeps missing evidence blocked even when the chain itself is intact", () => {
    const result = deriveTruthVerdictPresentation("BLOCKED_BY_MISSING_EVIDENCE", true, false);

    expect(result).toMatchObject({
      status: "BLOCKED_BY_MISSING_EVIDENCE",
      tone: "blocked",
      isVerified: false,
    });
    expect(result.heading).not.toContain("Verified Mission");
  });

  it("keeps contradictory evidence out of every green verified state", () => {
    const result = deriveTruthVerdictPresentation("CONTRADICTED", true, false);

    expect(result).toMatchObject({
      status: "CONTRADICTED",
      tone: "contradicted",
      isVerified: false,
    });
    expect(result.description).toContain("blocks");
  });

  it("downgrades a VERIFIED Judge result when integrity or policy gates fail", () => {
    expect(deriveTruthVerdictPresentation("VERIFIED", false, true)).toMatchObject({
      status: "NOT_VERIFIED",
      tone: "not_verified",
      isVerified: false,
    });
    expect(deriveTruthVerdictPresentation("VERIFIED", true, false)).toMatchObject({
      status: "NOT_VERIFIED",
      tone: "not_verified",
      isVerified: false,
    });
  });

  it("wires the rendered report through the same gate-aware presentation rather than an unconditional completed state", () => {
    expect(report).toContain("deriveTruthVerdictPresentation(");
    expect(report).toContain("presentation.isVerified");
    expect(report).not.toContain("**Status:** Completed");
    expect(report).not.toContain("Cryptographically sealed multi-agent consensus report");
  });
});

