import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-deploy-candidate.yml'), 'utf8');

describe('GCP candidate deploy replay boundary', () => {
  it('blocks GitHub re-runs before WIF authentication can incur provider work', () => {
    const guard = workflow.indexOf('test "$GITHUB_RUN_ATTEMPT" != \'1\'');
    const auth = workflow.indexOf('- name: Authenticate to Google Cloud using WIF');
    expect(guard).toBeGreaterThan(-1);
    expect(workflow).toContain('GitHub re-runs are blocked before WIF authentication.');
    expect(auth).toBeGreaterThan(guard);
  });

  it('keeps run attempt as execution evidence rather than a second mutation authorization', () => {
    expect(workflow).toContain('workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT');
    expect(workflow).toContain('runAttempt: process.env.GITHUB_RUN_ATTEMPT');
    expect(workflow).toContain('GITHUB_RUN_ID GITHUB_RUN_ATTEMPT');
  });
});
