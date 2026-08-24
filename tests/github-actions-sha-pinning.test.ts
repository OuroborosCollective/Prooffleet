import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflowDir = join(here, '../.github/workflows');
const workflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, content: readFileSync(join(workflowDir, name), 'utf8') }));

describe('GitHub Actions supply-chain pinning', () => {
  it('pins every external action in every workflow to a full reviewed commit SHA', () => {
    const violations = [];
    for (const workflow of workflows) {
      for (const line of workflow.content.split(/\r?\n/)) {
        const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
        if (!match) continue;
        const reference = match[1];
        if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
        if (!/@[0-9a-f]{40}$/.test(reference)) violations.push(workflow.name + ': ' + reference);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('contains no moving major tags for the privileged proof action families', () => {
    const source = workflows.map((workflow) => workflow.content).join('\n');
    for (const moving of [
      /actions\/checkout@v\d+/,
      /actions\/setup-node@v\d+/,
      /actions\/upload-artifact@v\d+/,
      /google-github-actions\/(?:auth|setup-gcloud)@v\d+/,
      /docker\/(?:login-action|setup-buildx-action|build-push-action)@v\d+/,
    ]) expect(source).not.toMatch(moving);
  });
});
