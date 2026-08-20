import { randomUUID } from "node:crypto";
import {
  InMemorySessionService,
  LlmAgent,
  Runner,
  isFinalResponse,
} from "@google/adk";
import type { Content } from "@google/genai";

/**
 * Canonical Gemini identity for ProofFleet's real LLM-backed agent roles.
 *
 * Truth boundary:
 * - Gemini is invoked through Google ADK, not directly through @google/genai.
 * - This provider has no tools and therefore cannot mutate repositories, cloud
 *   resources, consent state, evidence, or Judge verdicts.
 * - The legacy getGenAI() name is retained as a narrow compatibility surface
 *   for FleetRunner; its implementation is now ADK-backed.
 */
export const PROOFFLEET_GEMINI_PROVIDER = "google-adk" as const;
export const PROOFFLEET_GEMINI_MODEL = "gemini-3.7-flash" as const;

const ADK_APP_NAME = "prooffleet";
const ADK_USER_ID = "prooffleet-runtime";
const ADK_AGENT_NAME = "proof_fleet_reasoner";

interface AdkGenerateContentRequest {
  model: string;
  contents: string;
}

interface AdkGenerateContentResponse {
  text: string;
}

interface AdkGenAICompatibilitySurface {
  models: {
    generateContent(request: AdkGenerateContentRequest): Promise<AdkGenerateContentResponse>;
  };
}

let adkCompatibilityInstance: AdkGenAICompatibilitySurface | null = null;

function normalizedApiKey(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized === "MY_GEMINI_API_KEY") return null;
  return normalized;
}

/**
 * Resolve the single API-key identity used by the ADK Gemini runtime.
 *
 * ADK conventionally reads GOOGLE_API_KEY while the original AI Studio app used
 * GEMINI_API_KEY. Accept either for compatibility, but never guess if both are
 * configured differently.
 */
export function getGeminiApiKey(): string | null {
  const googleApiKey = normalizedApiKey(process.env.GOOGLE_API_KEY);
  const legacyGeminiApiKey = normalizedApiKey(process.env.GEMINI_API_KEY);

  if (googleApiKey && legacyGeminiApiKey && googleApiKey !== legacyGeminiApiKey) {
    throw new Error("gemini_api_key_conflict");
  }

  return googleApiKey ?? legacyGeminiApiKey;
}

function ensureAdkApiKey(apiKey: string): void {
  if (!normalizedApiKey(process.env.GOOGLE_API_KEY)) {
    // Process-local compatibility alias only. The value is never logged or
    // emitted into evidence/receipts.
    process.env.GOOGLE_API_KEY = apiKey;
  }
}

function finalTextFromEvent(event: { content?: Content }): string {
  return (event.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

/**
 * Compatibility surface consumed by FleetRunner.
 *
 * The returned generateContent call is implemented by a real Google ADK
 * LlmAgent + Runner invocation. The LlmAgent deliberately receives no tools:
 * it can produce bounded reasoning text, but no external effect or verdict.
 */
export function getGenAI(): AdkGenAICompatibilitySurface | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    // Honest offline/unconfigured state. Callers mark deterministic fallback
    // rather than claiming a Gemini/ADK invocation occurred.
    return null;
  }

  ensureAdkApiKey(apiKey);

  if (!adkCompatibilityInstance) {
    const sessionService = new InMemorySessionService();
    const agent = new LlmAgent({
      name: ADK_AGENT_NAME,
      model: PROOFFLEET_GEMINI_MODEL,
      instruction:
        "Provide bounded engineering reasoning only. Do not claim external actions, verification, consent, or final truth. ProofFleet's independent runtime authorities decide those states.",
    });
    const runner = new Runner({
      agent,
      appName: ADK_APP_NAME,
      sessionService,
    });

    adkCompatibilityInstance = {
      models: {
        generateContent: async ({ model, contents }) => {
          if (model !== PROOFFLEET_GEMINI_MODEL) {
            throw new Error(
              `unexpected_gemini_model: expected=${PROOFFLEET_GEMINI_MODEL} actual=${model}`,
            );
          }

          const sessionId = `reason-${randomUUID()}`;
          await sessionService.createSession({
            appName: ADK_APP_NAME,
            userId: ADK_USER_ID,
            sessionId,
          });

          const userMessage: Content = {
            role: "user",
            parts: [{ text: contents }],
          };

          let finalText = "";
          for await (const event of runner.runAsync({
            userId: ADK_USER_ID,
            sessionId,
            newMessage: userMessage,
          })) {
            if (!isFinalResponse(event)) continue;
            const text = finalTextFromEvent(event);
            if (text) finalText = text;
          }

          if (!finalText) {
            throw new Error("google_adk_no_final_response");
          }

          return { text: finalText };
        },
      },
    };
  }

  return adkCompatibilityInstance;
}
