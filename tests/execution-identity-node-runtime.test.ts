import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const sourcePath = 'server/evidence/executionIdentity.ts';

describe('privileged Node evidence module runtime', () => {
  it('uses explicit TypeScript module specifiers for native Node execution', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain("from './canonicalJson.ts'");
    expect(source).toContain("from '../revisionIdentity.ts'");
  });

  it('loads the exact evidence parser through the Node runtime used by privileged workflows', () => {
    const program = [
      "import('./server/evidence/executionIdentity.ts')",
      ".then((module) => {",
      "  if (typeof module.parseGoogleWifCredentialEvidence !== 'function') process.exit(2);",
      "})",
      ".catch((error) => { console.error(error); process.exit(1); });",
    ].join('\n');

    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
      cwd: process.cwd(),
      input: program,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
