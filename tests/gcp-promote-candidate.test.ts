import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/gcp-promote-candidate.yml'), 'utf8');

function triggerBlock(source: string): string {
  const match = source.match(/^on:\n([\s\S]*?)^permissions:/m);
  if (!match) throw new Error('promotion workflow trigger block not found');
  return match[1];
}

describe('GCP candidate promotion safety contract', () => {
  it('is explicit-only: owner-labeled PR before merge or confirmed manual dispatch after merge', () => {
    const triggers = triggerBlock(workflow);
    expect(triggers).toMatch(/^  workflow_dispatch:/m);
    expect(triggers).toMatch(/^  pull_request:/m);
    expect(triggers).toContain('types:\n      - labeled');
    expect(triggers).not.toMatch(/^  push:/m);
    expect(triggers).not.toContain('- opened');
    expect(triggers).not.toContain('- synchronize');
    expect(workflow).toContain("github.event.label.name == 'proofleet-promote-candidate'");
    expect(workflow).toContain("github.actor == 'OuroborosCollective'");
    expect(workflow).toContain("github.event.pull_request.user.login == 'OuroborosCollective'");
    expect(workflow).toContain("I_APPROVE_PROOFFLEET_CANDIDATE_PROMOTION");
  });

  it('binds promotion to the exact PR source head and never the synthetic merge SHA', () => {
    expect(workflow).toContain("EXPECTED_SOURCE_REVISION: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || inputs.expected_source_revision }}");
    expect(workflow).toContain('ref: ${{ env.EXPECTED_SOURCE_REVISION }}');
    expect(workflow).toContain('ACTUAL_SOURCE_REVISION="$(git rev-parse HEAD)"');
    expect(workflow).toContain('test "$ACTUAL_SOURCE_REVISION" != "$EXPECTED_SOURCE_REVISION"');
    expect(workflow).toContain('Refusing stale manual promotion:');
  });

  it('uses WIF and never accepts a long-lived service-account credential', () => {
    expect(workflow).toContain('google-github-actions/auth@v3');
    expect(workflow).toContain('GCP_DEPLOY_SERVICE_ACCOUNT');
    expect(workflow).not.toContain('credentials_json');
    expect(workflow).not.toContain('GOOGLE_APPLICATION_CREDENTIALS=');
  });

  it('requires the exact source-derived candidate tag to still be at zero normal traffic', () => {
    expect(workflow).toContain('CANDIDATE_TAG="pf-${EXPECTED_SOURCE_REVISION:0:12}"');
    expect(workflow).toContain('expected exactly one candidate tag ${candidateTag}');
    expect(workflow).toContain('candidate already receives ${candidatePercent}% normal traffic');
    expect(workflow).toContain('existing positive traffic must total 100 before promotion');
    expect(workflow).toContain('no rollback traffic snapshot available');
  });

  it('revalidates provider Ready, source label, declared source, runtime identity and immutable registry digest', () => {
    expect(workflow).toContain("labels['prooffleet-source-sha'] !== expectedSha");
    expect(workflow).toContain("String(labels['prooffleet-candidate']) !== 'true'");
    expect(workflow).toContain("c.type === 'Ready' && String(c.status).toLowerCase() === 'true'");
    expect(workflow).toContain("e.name === 'PROOFFLEET_SOURCE_REVISION'");
    expect(workflow).toContain('candidate runtime identity mismatch:');
    expect(workflow).toContain('candidate image is outside the expected Artifact Registry identity:');
    expect(workflow).toContain("/^sha256:[0-9a-f]{64}$/.test(digest)");
  });

  it('re-smokes the exact tagged candidate before any traffic mutation', () => {
    const smokeIndex = workflow.indexOf('Re-smoke exact tagged candidate immediately before traffic mutation');
    const updateIndex = workflow.indexOf('gcloud run services update-traffic "$PROOFFLEET_CLOUDRUN_SERVICE"');
    expect(smokeIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(smokeIndex);
    expect(workflow).toContain('"$CANDIDATE_URL/api/health"');
    expect(workflow).toContain('Refusing promotion because tagged candidate did not pass /api/health.');
    expect(workflow).toContain('[promotion-preflight] tagged candidate HTTP health observed');
  });

  it('promotes one exact revision only and never uses floating latest semantics', () => {
    expect(workflow).toContain('--to-revisions="${CANDIDATE_REVISION}=100"');
    expect(workflow).not.toContain('--to-latest');
    expect(workflow).not.toContain('LATEST=100');
    expect(workflow).not.toContain('revision_traffic:');
    expect(workflow).not.toContain('tag_traffic:');
  });

  it('captures prior traffic and attempts rollback on any failed post-promotion readback or health check', () => {
    expect(workflow).toContain("promotion-prior-traffic.txt");
    expect(workflow).toContain('trap rollback ERR');
    expect(workflow).toContain('[promotion-rollback] restoring prior traffic: $PREVIOUS_TRAFFIC');
    expect(workflow).toContain('--to-revisions="$PREVIOUS_TRAFFIC"');
    expect(workflow).toContain('[promotion-rollback] ROLLBACK_FAILED');
    expect(workflow).toContain('Promoted service failed /api/health; rollback is required.');
    expect(workflow).toContain('trap - ERR');
  });

  it('requires authoritative 100-percent post-readback and promoted service HTTP health', () => {
    expect(workflow).toContain('post-promotion candidate traffic is ${candidatePercent}, expected 100');
    expect(workflow).toContain('other revisions still receive positive traffic:');
    expect(workflow).toContain('Cloud Run service URL missing after promotion');
    expect(workflow).toContain('"$SERVICE_URL/api/health"');
    expect(workflow).toContain("receipt.outcome = 'OBSERVED_100_PERCENT_TRAFFIC'");
    expect(workflow).toContain('receipt.serviceHttpHealthObserved = true');
    expect(workflow).toContain('[promotion] exact candidate serves 100% traffic and passed /api/health');
  });

  it('does not create revisions, build images or touch Firestore in the promotion lane', () => {
    expect(workflow).not.toContain('docker/build-push-action');
    expect(workflow).not.toContain('deploy-cloudrun@');
    expect(workflow).not.toMatch(/gcloud\s+run\s+deploy\b/);
    expect(workflow).not.toMatch(/gcloud\s+firestore\b/);
  });

  it('uploads a promotion receipt after successful provider and HTTP readback', () => {
    expect(workflow).toContain("schemaVersion: 'prooffleet.gcp-promotion.v1'");
    expect(workflow).toContain("outcome: 'PREFLIGHT_ONLY'");
    expect(workflow).toContain('Upload promotion receipt');
    expect(workflow).toContain('gcp-promotion-receipt.json');
  });
});
