import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(here, "../server/agents");
const agentSources = readdirSync(agentsDir)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts" && name !== "base.ts")
  .map((name) => ({ name, source: readFileSync(join(agentsDir, name), "utf8") }));

describe("agent authority import boundary", () => {
  it("keeps provider-effect imports exclusive to the Operator module", () => {
    const effectImporters = agentSources
      .filter(({ source }) => /from ["']\.\.\/ops\//.test(source))
      .map(({ name }) => name);

    expect(effectImporters).toEqual(["operator.ts"]);
    expect(agentSources.find(({ name }) => name === "operator.ts")?.source)
      .toContain("createFirestoreOperatorExecutor");
  });

  it("keeps every non-Operator module free of direct GCP/operation authority imports", () => {
    const crossBoundaryImports = agentSources
      .filter(({ name }) => name !== "operator.ts")
      .filter(({ source }) => /from ["']\.\.\/(?:ops|adapters\/gcp)\//.test(source))
      .map(({ name }) => name);

    expect(crossBoundaryImports).toEqual([]);
  });
});
