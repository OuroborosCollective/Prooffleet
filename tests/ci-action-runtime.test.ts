import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/ci.yml'), 'utf8');

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe('ProofFleet CI action-runtime contract', () => {
  it('uses Node-24-ready GitHub action majors for every checkout and setup-node step', () => {
    expect(count(workflow, 'uses: actions/checkout@v7')).toBe(3);
    expect(count(workflow, 'uses: actions/setup-node@v7')).toBe(3);
    expect(workflow).not.toContain('actions/checkout@v4');
    expect(workflow).not.toContain('actions/setup-node@v4');
    expect(workflow).not.toMatch(/actions\/checkout@v[1-6]\b/);
    expect(workflow).not.toMatch(/actions\/setup-node@v[1-6]\b/);
  });

  it('keeps application execution on Node.js 22 while action internals move independently to Node 24', () => {
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
