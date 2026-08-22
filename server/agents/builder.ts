/**
 * builder.ts — erzeugt eine Artefakt-Spezifikation (deterministisch aus inputGoal)
 * und prueft sie EHRLICH: eine echte Schema-Validierung per Code. Externe Tools
 * (z.B. tsc) laufen nur, wenn explizit injiziert; sonst status 'not_executed'.
 * Permissions: [read, write, execute].
 */

import { createHash } from 'node:crypto';

import { AgentContext, AgentOutput, FleetAgent } from './base';

export interface BuilderCheck {
  name: string;
  status: 'passed' | 'failed' | 'not_executed';
  reason?: string;
  details?: Record<string, unknown>;
}

export interface ExternalToolRunner {
  /** Fuehrt ein echtes Tool aus (z.B. `tsc --noEmit`) und liefert exitCode+output. */
  run(command: string, args: string[]): Promise<{ exitCode: number; output: string }>;
}

export interface ArtifactSpec {
  artifactId: string;
  title: string;
  description: string;
  type: 'document' | 'code' | 'plan' | 'report';
  sections: string[];
  acceptanceCriteria: string[];
  specHash: string;
}

const ALLOWED_TYPES: readonly ArtifactSpec['type'][] = ['document', 'code', 'plan', 'report'];

/** Echte Schema-Validierung per Code — kein behaupteter Erfolg ohne Lauf. */
function validateArtifactSpec(spec: ArtifactSpec): BuilderCheck {
  const problems: string[] = [];
  if (typeof spec.artifactId !== 'string' || spec.artifactId.length === 0) problems.push('artifactId missing');
  if (typeof spec.title !== 'string' || spec.title.length === 0) problems.push('title missing');
  if (typeof spec.description !== 'string' || spec.description.length === 0) problems.push('description missing');
  if (!ALLOWED_TYPES.includes(spec.type)) problems.push(`type must be one of ${ALLOWED_TYPES.join(', ')}`);
  if (!Array.isArray(spec.sections) || spec.sections.length === 0) problems.push('sections must be a non-empty array');
  if (!Array.isArray(spec.acceptanceCriteria) || spec.acceptanceCriteria.length === 0) {
    problems.push('acceptanceCriteria must be a non-empty array');
  }
  const recomputed = createHash('sha256')
    .update(JSON.stringify({ ...spec, specHash: undefined }))
    .digest('hex');
  if (recomputed !== spec.specHash) problems.push('specHash mismatch (integrity check failed)');

  return {
    name: 'artifact_schema_validation',
    status: problems.length === 0 ? 'passed' : 'failed',
    ...(problems.length > 0 ? { reason: problems.join('; ') } : {}),
    details: { problemCount: problems.length, executed: true },
  };
}

/** Deterministische Artefakt-Spezifikation aus dem inputGoal. */
export function deriveArtifactSpec(inputGoal: string): ArtifactSpec {
  const base = {
    artifactId: `artifact-${createHash('sha256').update(inputGoal).digest('hex').slice(0, 12)}`,
    title: `Deliverable: ${inputGoal.slice(0, 80)}`,
    description: `Artefakt-Spezifikation, deterministisch abgeleitet aus dem Missionsziel: "${inputGoal}".`,
    type: 'plan' as const,
    sections: ['objective', 'scope', 'deliverables', 'risks', 'verification'],
    acceptanceCriteria: [
      'Alle Sections sind ausgefuellt',
      'Verifikationsnachweise sind als Evidence-Bloecke vorhanden',
    ],
  };
  const specHash = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return { ...base, specHash };
}

export function createBuilderAgent(toolRunner?: ExternalToolRunner): FleetAgent {
  const agent: FleetAgent = {
    role: 'builder',
    permissions: ['read', 'write', 'execute'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      const spec = deriveArtifactSpec(ctx.inputGoal);
      const checks: BuilderCheck[] = [validateArtifactSpec(spec)];

      // Optionaler echter Tool-Lauf (z.B. tsc) — nur wenn injiziert. Sonst ehrlich not_executed.
      if (toolRunner) {
        try {
          const result = await toolRunner.run('tsc', ['--noEmit']);
          checks.push({
            name: 'tsc_typecheck',
            status: result.exitCode === 0 ? 'passed' : 'failed',
            ...(result.exitCode !== 0 ? { reason: `exitCode=${result.exitCode}` } : {}),
            details: { executed: true, exitCode: result.exitCode, output: result.output.slice(0, 2000) },
          });
        } catch (err) {
          checks.push({
            name: 'tsc_typecheck',
            status: 'not_executed',
            reason: `tool runner failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } else {
        checks.push({
          name: 'tsc_typecheck',
          status: 'not_executed',
          reason: 'no external tool runner configured',
        });
      }

      const evidenceId = ctx.emitEvidence('artifact specification built and checked', 'artifact_spec', {
        spec,
        checks,
      });
      ctx.memory.set('artifactSpec', spec);
      ctx.logger(`builder: spec ${spec.artifactId}, checks=${checks.map((c) => `${c.name}:${c.status}`).join(',')}`);

      const failed = checks.filter((c) => c.status === 'failed');
      return {
        role: agent.role,
        summary:
          failed.length === 0
            ? `Artefakt-Spezifikation ${spec.artifactId} erstellt; ${checks.length} Checks ehrlich ausgewertet.`
            : `Artefakt-Spezifikation ${spec.artifactId}: ${failed.length} Check(s) FEHLGESCHLAGEN.`,
        evidenceIds: [evidenceId],
        findings: { artifact: spec, checks },
      };
    },
  };
  return agent;
}

export const builderAgent: FleetAgent = createBuilderAgent();
