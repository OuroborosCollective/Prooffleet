/**
 * sentinel.ts — ECHTE Sicherheits-Scans.
 * Permissions: [read, verify].
 * - Secret-Pattern-Scan ueber alle sichtbaren Payloads (Evidence-Snapshot + inputGoal).
 * - Permission-Konformitaet gegen die Rollenmatrix.
 * Findings nur aus Scan-Ergebnis — kein hartcodiertes "NEGLIGIBLE".
 */

import { AgentContext, AgentOutput, FleetAgent, Permission, requirePermission } from './base';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'google_api_key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'pem_private_key', pattern: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/g },
  { name: 'aws_access_key_id', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'generic_password_assignment', pattern: /password\s*=/gi },
];

/** Verbindliche Rollenmatrix (SPEC Abschnitt 4 / Delegationsauftrag). */
export const ROLE_PERMISSION_MATRIX: Readonly<Record<string, readonly Permission[]>> = {
  orchestrator: ['read', 'verify'],
  scout: ['read', 'verify'],
  builder: ['read', 'write', 'execute'],
  analyst: ['read', 'verify'],
  sentinel: ['read', 'verify'],
  auditor: ['read', 'verify'],
  gatekeeper: ['read', 'consent_gate'],
  operator: ['read', 'write', 'execute'],
};

export interface SecretFinding {
  pattern: string;
  location: string;
  matchPreview: string; // gekuerzt, nie das volle Secret
}

export interface PermissionViolation {
  role: string;
  detail: string;
}

function collectStrings(value: unknown, path: string, out: Array<{ location: string; text: string }>): void {
  if (typeof value === 'string') {
    out.push({ location: path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      collectStrings(v, `${path}.${k}`, out);
    }
  }
}

export function scanForSecrets(inputs: Array<{ location: string; text: string }>): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const { location, text } of inputs) {
    for (const { name, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        findings.push({
          pattern: name,
          location,
          matchPreview: `${m[0].slice(0, 6)}...(${m[0].length} chars)`,
        });
      }
    }
  }
  return findings;
}

export function checkPermissionConformance(
  actualRoles: Array<{ role: string; permissions: Permission[] }>,
): PermissionViolation[] {
  const violations: PermissionViolation[] = [];
  for (const { role, permissions } of actualRoles) {
    const expected = ROLE_PERMISSION_MATRIX[role];
    if (!expected) {
      violations.push({ role, detail: 'role not in permission matrix' });
      continue;
    }
    const missing = expected.filter((p) => !permissions.includes(p));
    const extra = permissions.filter((p) => !expected.includes(p));
    if (missing.length > 0) violations.push({ role, detail: `missing permissions: ${missing.join(', ')}` });
    if (extra.length > 0) violations.push({ role, detail: `excess permissions: ${extra.join(', ')}` });
  }
  return violations;
}

export function createSentinelAgent(): FleetAgent {
  const agent: FleetAgent = {
    role: 'sentinel',
    permissions: ['read', 'verify'],
    async run(ctx: AgentContext): Promise<AgentOutput> {
      if (ctx.requestConsent) {
        requirePermission(agent, 'consent_gate');
      }

      // Sichtbare Payloads: inputGoal + Evidence-Snapshot (falls uebergeben).
      const strings: Array<{ location: string; text: string }> = [];
      collectStrings(ctx.inputGoal, 'inputGoal', strings);
      const snapshot = ctx.memory.get('evidenceSnapshot');
      if (Array.isArray(snapshot)) {
        collectStrings(snapshot, 'evidenceSnapshot', strings);
      }
      const secretFindings = scanForSecrets(strings);

      // Permission-Konformitaet gegen die Matrix (tatsaechliche Fleet aus memory, sonst nur Matrix-Selbsttest).
      const fleetRaw = ctx.memory.get('fleetRoles');
      const actualRoles: Array<{ role: string; permissions: Permission[] }> = Array.isArray(fleetRaw)
        ? (fleetRaw as Array<{ role: string; permissions: Permission[] }>)
        : Object.entries(ROLE_PERMISSION_MATRIX).map(([role, perms]) => ({
            role,
            permissions: [...perms] as Permission[],
          }));
      const permissionViolations = checkPermissionConformance(actualRoles);

      const promptInjectionRisk =
        secretFindings.length > 0 || permissionViolations.length > 0 ? 'ELEVATED' : 'LOW';
      // Kein Prozentsatz, keine Konfidenz — nur gemessene Befunde.

      const evidenceId = ctx.emitEvidence('security scan completed', 'security_scan', {
        scannedStringFields: strings.length,
        secretFindings,
        permissionViolations,
        promptInjectionRisk,
      });

      return {
        role: agent.role,
        summary:
          secretFindings.length === 0 && permissionViolations.length === 0
            ? `Scan abgeschlossen: ${strings.length} Felder geprueft, keine Befunde.`
            : `Scan abgeschlossen: ${secretFindings.length} Secret-Befund(e), ${permissionViolations.length} Permission-Verletzung(en).`,
        evidenceIds: [evidenceId],
        findings: {
          promptInjectionRisk,
          secretFindings,
          permissionViolations,
          contradictionRelevant: secretFindings.length > 0 || permissionViolations.length > 0,
        },
      };
    },
  };
  return agent;
}

export const sentinelAgent: FleetAgent = createSentinelAgent();
