import { writeFileSync } from "node:fs";

import { runAdkRuntimeCanary } from "../server/adkCanary";

const sourceRevision = process.env.PROOFFLEET_CANARY_SOURCE_REVISION ?? "";
const receipt = await runAdkRuntimeCanary(sourceRevision);
const outputPath = "adk-live-canary-receipt.json";

writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

// Safe output only: the receipt contains hashes and non-sensitive runtime
// identity, never the raw prompt, challenge, response or API credential.
console.log(JSON.stringify(receipt, null, 2));
