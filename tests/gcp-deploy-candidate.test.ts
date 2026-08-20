import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-deploy-candidate.yml'), 'utf8');
const dockerfile = readFileSync(join(here, '../Dockerfile'), 'utf8');

describe('GCP candidate deploy safety contract', () => {
  it('is manual-only and requires an exact source revision plus explicit confirmation', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\n\s+push:/);
    expect(workflow).not.toMatch(/\n\s+pull_request:/);
    expect(workflow).toContain('expected_source_revision:');
    expect(workflow).toContain("EXPECTED_SOURCE_REVISION: ${{ inputs.expected_source_revision }}");
    expect(workflow).toContain('test "$EXPECTED_SOURCE_REVISION" != "$GITHUB_SHA"');
    expect(workflow).toContain("I_APPROVE_PROOFFLEET_CANDIDATE_DEPLOY");
  });

  it('uses WIF and never accepts a long-lived service-account JSON credential', () => {
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('GCP_DEPLOY_SERVICE_ACCOUNT');
    expect(workflow).not.toContain('credentials_json');
    expect(workflow).not.toContain('GOOGLE_APPLICATION_CREDENTIALS=');
  });

  it('builds an immutable SHA-tagged image and requires a sha256 registry digest', () => {
    expect(workflow).toContain('docker/build-push-action@v6');
    expect(workflow).toContain('push: true');
    expect(workflow).toContain('${{ github.sha }}');
    expect(workflow).toContain("'^sha256:[0-9a-f]{64}$'");
    expect(workflow).toContain('@${{ steps.build.outputs.digest }}');
  });

  it('deploys a zero-traffic revision and never promotes traffic in the candidate lane', () => {
    expect(workflow).toContain('google-github-actions/deploy-cloudrun@v3');
    expect(workflow).toContain('no_traffic: true');
    expect(workflow).not.toContain('revision_traffic:');
    expect(workflow).not.toContain('tag_traffic:');
    expect(workflow).not.toContain('LATEST=100');
    expect(workflow).toContain('candidate revision unexpectedly receives ${percent}% traffic');
  });

  it('merges only the exact source revision into upstream environment instead of replacing AI Studio config', () => {
    expect(workflow).toContain('PROOFFLEET_SOURCE_REVISION=${{ github.sha }}');
    expect(workflow).toContain('env_vars_update_strategy: merge');
    expect(workflow).toContain('env-names-before.txt');
    expect(workflow).toContain('upstream environment variable disappeared during merge deploy');
  });

  it('fails if deployment changes the existing Cloud Run runtime service account', () => {
    expect(workflow).toContain('runtime-sa-before.txt');
    expect(workflow).toContain('runtime service account changed:');
    expect(workflow).not.toContain('511695074775-compute@developer.gserviceaccount.com');
  });

  it('produces a minimal production image from the immutable npm graph', () => {
    expect(dockerfile).toContain('FROM node:22-bookworm-slim AS build');
    expect(dockerfile).toContain('RUN npm ci --no-audit --no-fund');
    expect(dockerfile).toContain('RUN npm run build');
    expect(dockerfile).toContain('RUN npm ci --omit=dev --no-audit --no-fund');
    expect(dockerfile).toContain('COPY --from=build /app/dist ./dist');
    expect(dockerfile).toContain('EXPOSE 8080');
    expect(dockerfile).toContain('CMD ["node", "dist/server.cjs"]');
  });
});
