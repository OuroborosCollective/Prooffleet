import { describe, expect, it } from 'vitest';
import { buildArtifactBinding } from '../scripts/ci-artifact-binding.mjs';
import { buildRevisionReceipt } from '../scripts/ci-revision-receipt.mjs';

const RUN_ID = '32517685281';
const ATTEMPT = '1';
const SOURCE = '1'.repeat(40);
const HEALTH_BYTES = Buffer.from('hello', 'utf8');
const HEALTH_SHA = 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const receipt = buildRevisionReceipt({
  eventName: 'push',
  githubSha: SOURCE,
  checkedOutSha: SOURCE,
  runId: RUN_ID,
  runAttempt: ATTEMPT,
  repositoryId: '1339097875',
  repositoryOwnerId: '266194342',
  actorId: '266194342',
  runnerEnvironment: 'github-hosted',
  runnerOs: 'Linux',
  runnerArch: 'X64',
  runnerName: 'GitHub Actions 1000221664',
  containerId: '2'.repeat(64),
  containerImageId: 'sha256:' + '3'.repeat(64),
  containerRunning: true,
  healthReadbackSha256: HEALTH_SHA,
});

describe('CI artifact binding receipt', () => {
  it('binds the GitHub artifact ID/digest to the receipt and exact health artifact bytes', () => {
    const binding = buildArtifactBinding({
      receipt,
      artifactId: '9524085296',
      artifactDigest: 'sha256:' + '4'.repeat(64),
      artifactName: 'prooffleet-ci-runtime-evidence-' + RUN_ID + '-' + ATTEMPT,
      healthBytes: HEALTH_BYTES,
    });
    expect(binding.schemaVersion).toBe('prooffleet.ci-artifact-binding.v1');
    expect(binding.receipt.evidenceIdentitySha256).toBe(receipt.evidenceIdentitySha256);
    expect(binding.runtimeEvidenceArtifact).toEqual({
      id: '9524085296',
      name: 'prooffleet-ci-runtime-evidence-' + RUN_ID + '-' + ATTEMPT,
      digest: 'sha256:' + '4'.repeat(64),
    });
    expect(binding.runtimeHealthArtifactSha256).toBe(HEALTH_SHA);
    expect(binding.bindingSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('blocks wrong health bytes, a wrong artifact name, false runtime state, receipt mutation and malformed artifact identity', () => {
    const valid = {
      receipt,
      artifactId: '9524085296',
      artifactDigest: 'sha256:' + '4'.repeat(64),
      artifactName: 'prooffleet-ci-runtime-evidence-' + RUN_ID + '-' + ATTEMPT,
      healthBytes: HEALTH_BYTES,
    };
    expect(() => buildArtifactBinding({ ...valid, healthBytes: Buffer.from('tampered') })).toThrow(/health artifact bytes/);
    expect(() => buildArtifactBinding({ ...valid, artifactName: 'other-run' })).toThrow(/artifactName/);
    expect(() => buildArtifactBinding({ ...valid, artifactId: '0' })).toThrow(/positive decimal integer/);
    expect(() => buildArtifactBinding({ ...valid, artifactDigest: 'latest' })).toThrow(/exact sha256 digest/);
    expect(() => buildArtifactBinding({ ...valid, receipt: { ...receipt, runtime: { ...receipt.runtime, containerRunning: false } } })).toThrow(/observed running/);
    expect(() => buildArtifactBinding({ ...valid, receipt: { ...receipt, sourceHeadSha: '9'.repeat(40) } })).toThrow(/identity hash/);
  });
});
