import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflowDir = join(here, '../.github/workflows');
const workflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, content: readFileSync(join(workflowDir, name), 'utf8') }));

const reviewedExternalActions = new Set([
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093',
  'google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db',
  'docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9',
  'docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f',
  'docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8',
]);

function externalReferences() {
  const references: Array<{ workflow: string; reference: string }> = [];
  for (const workflow of workflows) {
    for (const line of workflow.content.split(/\r?\n/)) {
      const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
      if (!match) continue;
      const reference = match[1];
      if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
      references.push({ workflow: workflow.name, reference });
    }
  }
  return references;
}

describe('GitHub Actions supply-chain pinning', () => {
  it('pins every external action in every workflow to a full commit SHA', () => {
    const violations = externalReferences()
      .filter(({ reference }) => !/@[0-9a-f]{40}$/.test(reference))
      .map(({ workflow, reference }) => `${workflow}: ${reference}`);
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('rejects unknown or newly introduced external action identities', () => {
    const violations = externalReferences()
      .filter(({ reference }) => !reviewedExternalActions.has(reference))
      .map(({ workflow, reference }) => `${workflow}: ${reference}`);
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
