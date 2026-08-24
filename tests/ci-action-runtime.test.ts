import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/ci.yml'), 'utf8');
const CHECKOUT_PIN = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_PIN = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe('ProofFleet CI action-runtime contract', () => {
  it('pins every checkout and setup-node invocation to the reviewed full commit SHA', () => {
    expect(count(workflow, `uses: ${CHECKOUT_PIN}`)).toBe(3);
    expect(count(workflow, `uses: ${SETUP_NODE_PIN}`)).toBe(3);
    expect(workflow).not.toMatch(/actions\/checkout@v\d+\b/);
    expect(workflow).not.toMatch(/actions\/setup-node@v\d+\b/);
  });

  it('keeps application execution on Node.js 22 while action internals move independently', () => {
    expect(count(workflow, 'node-version: 22')).toBe(3);
    expect(workflow).not.toContain('node-version: 24');
  });

  it('disables implicit npm caching in privileged and audit jobs', () => {
    expect(count(workflow, 'package-manager-cache: false')).toBe(2);

    const bootstrapStart = workflow.indexOf('bootstrap-lockfile:');
    const verifyStart = workflow.indexOf('\n  verify:');
    const auditStart = workflow.indexOf('\n  dependency-audit:');
    expect(bootstrapStart).toBeGreaterThan(-1);
    expect(verifyStart).toBeGreaterThan(bootstrapStart);
    expect(auditStart).toBeGreaterThan(verifyStart);

    const bootstrap = workflow.slice(bootstrapStart, verifyStart);
    const verify = workflow.slice(verifyStart, auditStart);
    const audit = workflow.slice(auditStart);

    expect(bootstrap).toContain('package-manager-cache: false');
    expect(audit).toContain('package-manager-cache: false');
    expect(verify).not.toContain('package-manager-cache: false');
  });

  it('retains explicit npm cache configuration only for the verification job', () => {
    expect(count(workflow, 'cache: npm')).toBe(1);
    expect(count(workflow, 'cache-dependency-path: package.json')).toBe(1);
  });
});
