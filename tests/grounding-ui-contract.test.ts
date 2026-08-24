import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, '../server.ts'), 'utf8');
const app = readFileSync(join(here, '../src/App.tsx'), 'utf8');
const panel = readFileSync(join(here, '../src/components/GroundingEvidencePanel.tsx'), 'utf8');
const grounding = readFileSync(join(here, '../server/evidence/grounding.ts'), 'utf8');

describe('Grounding UI and runtime wiring contract', () => {
  it('exposes only a read-only grounding status route in P0', () => {
    expect(server).toContain('app.get("/api/evidence/grounding/status"');
    expect(server).toContain('createUnconfiguredAgentSearchEvidenceProvider');
    expect(server).toContain('groundingStatusSnapshot(groundingProvider)');
    expect(server).not.toContain('app.post("/api/evidence/grounding');
  });

  it('polls the read-only grounding status and renders a dedicated evidence panel', () => {
    expect(app).toContain('fetch("/api/evidence/grounding/status")');
    expect(app).toContain('setGroundingStatus(data)');
    expect(app).toContain('<GroundingEvidencePanel snapshot={groundingStatus} />');
  });

  it('labels grounding as evidence rather than a Judge verdict', () => {
    expect(panel).toContain('GROUNDING_OBSERVED');
    expect(panel).toContain('NOT_CONFIGURED');
    expect(panel).toContain('evidence input, not a Judge verdict');
    expect(panel).not.toContain('VERIFIED');
  });

  it('contains no provider credential material or cost-triggering runtime route', () => {
    for (const source of [grounding, panel]) {
      expect(source).not.toContain('GOOGLE_API_KEY');
      expect(source).not.toContain('GEMINI_API_KEY');
      expect(source).not.toContain('Authorization: Bearer');
    }
    expect(server).not.toContain('agent-search.googleapis.com');
    expect(server).not.toContain('discoveryengine.googleapis.com');
  });
});
