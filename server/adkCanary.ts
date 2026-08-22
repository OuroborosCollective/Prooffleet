import { randomUUID } from "node:crypto";

import {
  getGenAI,
  PROOFFLEET_GEMINI_MODEL,
  PROOFFLEET_GEMINI_PROVIDER,
} from "./gemini";
import { sha256Hex } from "./evidence/canonicalJson";

export const ADK_CANARY_SCHEMA_VERSION = "prooffleet.adk-runtime-canary.v1" as const;
export const ADK_CANARY_OUTCOME = "ADK_RUNTIME_OBSERVED" as const;

interface AdkCanaryProvider {
  models: {
    generateContent(request: {
      model: string;
      contents: string;
    }): Promise<{ text: string }>;
  };
}

export interface AdkRuntimeCanaryReceipt {
  schemaVersion: typeof ADK_CANARY_SCHEMA_VERSION;
  outcome: typeof ADK_CANARY_OUTCOME;
  sourceRevision: string;
  framework: typeof PROOFFLEET_GEMINI_PROVIDER;
  modelId: typeof PROOFFLEET_GEMINI_MODEL;
  challengeSha256: string;
  responseSha256: string;
  challengeMatched: true;
  finalResponseObserved: true;
  observedAt: string;
}

export interface AdkRuntimeCanaryDependencies {
  providerFactory?: () => AdkCanaryProvider | null;
  nonceFactory?: () => string;
  now?: () => Date;
}

function requireExactSourceRevision(sourceRevision: string): void {
  if (!/^[0-9a-f]{40}$/.test(sourceRevision)) {
    throw new Error("adk_canary_source_revision_invalid");
  }
}

function makeChallenge(rawNonce: string): string {
  const nonce = rawNonce.replace(/[^A-Za-z0-9]/g, "");
  if (nonce.length < 16) {
    throw new Error("adk_canary_nonce_invalid");
  }
  return `PROOFFLEET_ADK_CANARY_${nonce}`;
}

/**
 * Execute one bounded live ADK -> Gemini challenge/response.
 *
 * This is deliberately not an evidence source for any world claim, deployment,
 * consent decision, or external effect. It proves only that this exact source
 * revision reached the production ADK provider path and observed a matching
 * final Gemini response.
 *
 * Raw prompt, challenge, response and credentials are never returned in the
 * receipt. Only hashes and non-sensitive runtime identity are persisted.
 */
export async function runAdkRuntimeCanary(
  sourceRevision: string,
  dependencies: AdkRuntimeCanaryDependencies = {},
): Promise<AdkRuntimeCanaryReceipt> {
  requireExactSourceRevision(sourceRevision);

  const providerFactory = dependencies.providerFactory ?? (() => getGenAI());
  const provider = providerFactory();
  if (!provider) {
    throw new Error("adk_canary_provider_not_configured");
  }

  const challenge = makeChallenge((dependencies.nonceFactory ?? randomUUID)());
  const prompt = [
    "ProofFleet runtime canary.",
    "Return exactly the token on the next line and nothing else.",
    challenge,
  ].join("\n");

  const result = await provider.models.generateContent({
    model: PROOFFLEET_GEMINI_MODEL,
    contents: prompt,
  });
  const response = result.text.trim();

  if (!response) {
    throw new Error("adk_canary_empty_final_response");
  }
  if (response !== challenge) {
    throw new Error("adk_canary_challenge_mismatch");
  }

  const observedAt = (dependencies.now ?? (() => new Date()))().toISOString();

  return {
    schemaVersion: ADK_CANARY_SCHEMA_VERSION,
    outcome: ADK_CANARY_OUTCOME,
    sourceRevision,
    framework: PROOFFLEET_GEMINI_PROVIDER,
    modelId: PROOFFLEET_GEMINI_MODEL,
    challengeSha256: sha256Hex(challenge),
    responseSha256: sha256Hex(response),
    challengeMatched: true,
    finalResponseObserved: true,
    observedAt,
  };
}
