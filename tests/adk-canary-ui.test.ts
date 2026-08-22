import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, '../src/App.tsx'), 'utf8');
const panel = readFileSync(join(here, '../src/components/AdkRuntimeCanaryPanel.tsx'), 'utf8');

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`unable to isolate source block: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

describe('ADK canary operator UI safety contract', () => {
  it('polls the read-only runtime canary endpoint alongside the existing operator session', () => {
    expect(app).toContain('fetch("/api/operator/session")');
    expect(app).toContain('fetch("/api/runtime/adk-canary")');
    expect(app).toContain('setAdkCanary(data)');
  });

  it('reuses the existing operator-session login instead of creating a second authentication authority', () => {
    expect(app).toContain('onAuthenticate={handleOperatorAuthenticate}');
    expect(app).toContain('<ConsentGateModal');
    expect(app).toContain('<AdkRuntimeCanaryPanel');
    expect(app).toContain('credentials: "same-origin"');
    expect(app).toContain('body: JSON.stringify({ token })');
  });

  it('triggers the canary with only the HttpOnly session and explicit intent header', () => {
    const canaryHandler = between(app, 'const handleRunAdkCanary = async () => {', 'const handleConsentRespond = async (');
    expect(canaryHandler).toContain('fetch("/api/runtime/adk-canary"');
    expect(canaryHandler).toContain('method: "POST"');
    expect(canaryHandler).toContain('"X-ProofFleet-Canary-Intent": "1"');
    expect(canaryHandler).toContain('credentials: "same-origin"');
    expect(canaryHandler).not.toContain('body:');
    expect(canaryHandler).not.toContain('token');
    expect(canaryHandler).not.toContain('operatorIdentity');
    expect(canaryHandler).not.toContain('GOOGLE_API_KEY');
    expect(canaryHandler).not.toContain('GEMINI_API_KEY');
  });

  it('revokes local authentication state on a 401 canary response', () => {
    const canaryHandler = between(app, 'const handleRunAdkCanary = async () => {', 'const handleConsentRespond = async (');
    expect(canaryHandler).toContain('if (res.status === 401)');
    expect(canaryHandler).toContain('authenticated: false');
    expect(canaryHandler).toContain('identity: null');
  });

  it('keeps the operator credential in password component state and out of browser storage', () => {
    expect(panel).toContain('const [operatorToken, setOperatorToken] = useState("")');
    expect(panel).toContain('type="password"');
    expect(panel).toContain('if (authenticated) setOperatorToken("")');
    expect(panel).not.toContain('localStorage');
    expect(panel).not.toContain('sessionStorage');
    expect(panel).not.toContain('document.cookie');
  });

  it('never upgrades a runtime observation into a VERIFIED mission claim', () => {
    expect(panel).toContain('ADK_RUNTIME_OBSERVED');
    expect(panel).toContain('SOURCE BINDING REQUIRED');
    expect(panel).not.toContain('VERIFIED');
    expect(panel).not.toContain('Mission verified');
    expect(panel).not.toContain('mission verified');
  });

  it('explains that the canary has no tool, mutation, consent or judge authority', () => {
    expect(panel).toContain('It performs no tool call');
    expect(panel).toContain('cloud mutation');
    expect(panel).toContain('consent decision');
    expect(panel).toContain('Judge action');
  });

  it('does not offer a same-process retry after a failed live canary', () => {
    expect(panel).toContain('const failed = canary?.status === "FAILED"');
    expect(panel).toContain('!failed');
    expect(panel).toContain('spent its one bounded ADK canary attempt');
    expect(panel).not.toContain('Retry ADK canary');
  });
});
