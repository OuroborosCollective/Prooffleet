import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ONE_SHOT_WORKFLOW = '.github/workflows/pin-actions-once.yml';
const PINS = new Map([
  ['actions/checkout@v4', 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/checkout@v7', 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'],
  ['actions/setup-node@v7', 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'],
  ['actions/upload-artifact@v4', 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'],
  ['google-github-actions/auth@v3', 'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093'],
  ['google-github-actions/setup-gcloud@v3', 'google-github-actions/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db'],
  ['docker/login-action@v3', 'docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9'],
  ['docker/setup-buildx-action@v3', 'docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f'],
  ['docker/build-push-action@v6', 'docker/build-push-action@263435318d21b8e681c14492fe198d362a7d2c83'],
]);

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const candidates = [
  ...walk(join(ROOT, '.github', 'workflows')).filter((path) => /\.ya?ml$/.test(path)),
  ...walk(join(ROOT, 'tests')).filter((path) => /\.(?:ts|tsx)$/.test(path)),
];

let replacements = 0;
for (const path of candidates) {
  let content = readFileSync(path, 'utf8');
  const before = content;
  for (const [tag, pin] of PINS) {
    const occurrences = content.split(tag).length - 1;
    if (occurrences > 0) {
      content = content.split(tag).join(pin);
      replacements += occurrences;
    }
  }
  if (content !== before) writeFileSync(path, content, 'utf8');
}

const testPath = join(ROOT, 'tests', 'github-actions-sha-pinning.test.ts');
writeFileSync(testPath, `import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflowDir = join(here, '../.github/workflows');
const workflows = readdirSync(workflowDir)
  .filter((name) => /\\.ya?ml$/.test(name))
  .map((name) => ({ name, content: readFileSync(join(workflowDir, name), 'utf8') }));

describe('GitHub Actions supply-chain pinning', () => {
  it('pins every external action in every workflow to a full reviewed commit SHA', () => {
    const violations = [];
    for (const workflow of workflows) {
      for (const line of workflow.content.split(/\\r?\\n/)) {
        const match = line.match(/^\\s*-?\\s*uses:\\s*([^\\s#]+)(?:\\s+#.*)?$/);
        if (!match) continue;
        const reference = match[1];
        if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
        if (!/@[0-9a-f]{40}$/.test(reference)) violations.push(workflow.name + ': ' + reference);
      }
    }
    expect(violations, violations.join('\\n')).toEqual([]);
  });

  it('contains no moving major tags for the privileged proof action families', () => {
    const source = workflows.map((workflow) => workflow.content).join('\\n');
    for (const moving of [
      /actions\\/checkout@v\\d+/,
      /actions\\/setup-node@v\\d+/,
      /actions\\/upload-artifact@v\\d+/,
      /google-github-actions\\/(?:auth|setup-gcloud)@v\\d+/,
      /docker\\/(?:login-action|setup-buildx-action|build-push-action)@v\\d+/,
    ]) expect(source).not.toMatch(moving);
  });
});
`, 'utf8');

const oneShotPath = join(ROOT, ONE_SHOT_WORKFLOW);
if (statSync(oneShotPath, { throwIfNoEntry: false })) unlinkSync(oneShotPath);

console.log(`[pin-actions] replacements=${replacements}`);
console.log(`[pin-actions] regression_test=${relative(ROOT, testPath)}`);
console.log(`[pin-actions] removed_one_shot=${ONE_SHOT_WORKFLOW}`);
