/**
 * base.ts — Gemeinsame Vertrags-Typen fuer die ProofFleet-Agenten.
 *
 * Grundprinzipien (SPEC):
 * - Keine simulierte Wahrheit: nichts behauptet Erfolg, das nicht real geprueft wurde.
 * - Kommunikation nur ueber AgentContext (kein geteilter mutierbarer State).
 * - Rollen ohne 'write'-Permission bekommen zur Laufzeit kein requestConsent/execute.
 */

export type Permission = 'read' | 'write' | 'execute' | 'verify' | 'consent_gate';

export interface AgentContext {
  missionId: string;
  missionRevision: number;
  inputGoal: string;
  memory: {
    get(k: string): unknown;
    set(k: string, v: unknown): void;
  };
  /** Versiegelt eine Evidence-Behauptung im Ledger, liefert die Evidence-/Block-Id. */
  emitEvidence(claim: string, evidenceType: string, payload: Record<string, unknown>): string;
  /** Nur fuer Rollen mit 'consent_gate'-Permission verfuegbar. */
  requestConsent?(spec: unknown): string;
  logger(msg: string): void;
}

export interface AgentOutput {
  role: string;
  summary: string;
  evidenceIds: string[];
  findings?: Record<string, unknown>;
}

export interface FleetAgent {
  role: string;
  permissions: Permission[];
  run(ctx: AgentContext): Promise<AgentOutput>;
}

/** Optionales LLM-Provider-Interface. Ohne Provider: ehrlicher, markierter Fallback. */
export interface LlmProvider {
  generate(prompt: string): Promise<string>;
}

export const FALLBACK_MARKER = 'deterministic_fallback' as const;

/**
 * Laufzeit-Guard: erzwingt, dass eine Rolle eine Permission besitzt.
 * Wirft, sonst — keine stille Degradation.
 */
export function requirePermission(agent: FleetAgent, permission: Permission): void {
  if (!agent.permissions.includes(permission)) {
    throw new Error(
      `permission_violation: role '${agent.role}' lacks required permission '${permission}'`,
    );
  }
}

/** Hilfsfunktion fuer ehrliche LLM-Nutzung: ohne Provider kein Fake-"AI-Output". */
export async function generateHonest(
  provider: LlmProvider | undefined,
  prompt: string,
  deterministicFallback: string,
): Promise<{ text: string; source: 'llm' | typeof FALLBACK_MARKER }> {
  if (provider) {
    const text = await provider.generate(prompt);
    return { text, source: 'llm' };
  }
  return { text: deterministicFallback, source: FALLBACK_MARKER };
}
