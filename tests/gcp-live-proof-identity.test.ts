import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here=dirname(fileURLToPath(import.meta.url));
const workflow=readFileSync(join(here,'../.github/workflows/gcp-live-proof.yml'),'utf8');

describe('live GCP credential evidence workflow',()=>{
 it('carries immutable GitHub numeric identities into the proof process',()=>{
  expect(workflow).toContain('PROOFFLEET_GITHUB_RUN_ID: ${{ github.run_id }}');
  expect(workflow).toContain('PROOFFLEET_GITHUB_RUN_ATTEMPT: ${{ github.run_attempt }}');
  expect(workflow).toContain('PROOFFLEET_GITHUB_REPOSITORY_ID: ${{ github.repository_id }}');
  expect(workflow).toContain('PROOFFLEET_GITHUB_REPOSITORY_OWNER_ID: ${{ github.repository_owner_id }}');
  expect(workflow).toContain('PROOFFLEET_GITHUB_ACTOR_ID: ${{ github.actor_id }}');
 });
 it('requires authenticated gcloud readback of active principal and project',()=>{
  expect(workflow).toContain("gcloud auth list --filter=status:ACTIVE --format='value(account)'");
  expect(workflow).toContain('gcloud projects describe "$GCP_PROJECT_ID"');
  expect(workflow).toContain('PROOFFLEET_WIF_PRINCIPAL');
  expect(workflow).toContain('PROOFFLEET_GCP_PROJECT_NUMBER');
 });
 it('binds artifact identity to run, attempt and exact checked source SHA',()=>{
  expect(workflow).toContain('prooffleet-gcp-live-proof-${{ github.run_id }}-${{ github.run_attempt }}-${{ env.PROOFFLEET_SOURCE_REVISION }}');
 });
});
