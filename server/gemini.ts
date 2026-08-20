import { GoogleGenAI } from "@google/genai";

/**
 * Canonical Gemini identity for ProofFleet's real LLM-backed agent roles.
 * Keep this in one place so UI/manifest/runtime cannot silently drift.
 */
export const PROOFFLEET_GEMINI_PROVIDER = "google-genai" as const;
export const PROOFFLEET_GEMINI_MODEL = "gemini-3.6-flash" as const;

let genAIInstance: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    // Honest offline/unconfigured state. Callers must mark deterministic fallback
    // rather than claiming a Gemini request occurred.
    return null;
  }

  if (!genAIInstance) {
    genAIInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "prooffleet-hackathon",
        },
      },
    });
  }

  return genAIInstance;
}
