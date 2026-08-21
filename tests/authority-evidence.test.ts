import { describe, expect, it } from 'vitest';

import {
  buildArtifactBinding,
  buildCredentialEvidence,
  buildGitHubExecutionIdentity,
  parseCandidateDeployResponse,
  parseCandidateRevisionReadback,
  parseCandidateServiceTrafficReadback,
  parseCredentialConfig,
  sealReceipt,
} from '../scripts/authority-evidence.mjs';

const SOURCE = 'a'.repeat(40);
const INDEX = `sha256:${'b'.repeat(64)}`;
const RUNTIME = `sha256:${'c'.repeat(64)}`;
const PROVIDER = 'projects/123456789012/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo';
const DEPLOY_SA = 'prooffleet-deploy@proofleet-test-12345.iam.gserviceaccount.com';

function githubEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_REPOSITORY_ID: '1339097875',
    GITHUB_REPOSITORY_OWNER_ID: '266194342',
    GITHUB_ACTOR_ID: '266194342',
    GITHUB_RUN_ID: '32516371741',
    GITHUB_RUN_ATTEMPT: '1',
    RUNNER_NAME: 'GitHub Actions 1000221664',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    ...overrides,
  };
}

function credentialConfig(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'external_account',
    audience: `//iam.googleapis.com/${PROVIDER}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    credential_source: { url: 'https://example.invalid/oidc' },
    service_account_impersonation_url:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${DEPLOY_SA}:generateAccessToken`,
    ...overrides,
  });
}

describe('authority evidence primitives', () => {
  it('binds execution identity to immutable GitHub IDs, run identity, source and runner fingerprint', () => {
    const identity = buildGitHubExecutionIdentity(githubEnv(), {
      sourceRevision: SOURCE,
      expectedRepositoryId: '1339097875',
      expectedOwnerId: '266194342',
    });

    expect(identity.repositoryId).toBe('1339097875');
    expect(identity.repositoryOwnerId).toBe('266194342');
    expect(identity.actorId).toBe('266194342');
    expect(identity.runId).toBe('32516371741');
    expect(identity.runAttempt).toBe('1');
    expect(identity.runner.nameSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.identityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(identity)).not.toContain('GitHub Actions 1000221664');
  });

  it('does not use mutable actor names or workflow paths as execution identity inputs', () => {
    const first = buildGitHubExecutionIdentity(
      githubEnv({ GITHUB_ACTOR: 'old-name', GITHUB_WORKFLOW: 'old-path' }),
      { sourceRevision: SOURCE },
    );
    const second = buildGitHubExecutionIdentity(
      githubEnv({ GITHUB_ACTOR: 'renamed-user', GITHUB_WORKFLOW: 'renamed-workflow' }),
      { sourceRevision: SOURCE },
    );
    expect(first.identityHash).toBe(second.identityHash);
  });

  it('fails closed on missing or mismatched immutable GitHub identities', () => {
    expect(() => buildGitHubExecutionIdentity(githubEnv({ GITHUB_ACTOR_ID: 'owner-name' }), {
      sourceRevision: SOURCE,
    })).toThrow(/positive numeric identity/);
    expect(() => buildGitHubExecutionIdentity(githubEnv(), {
      sourceRevision: SOURCE,
      expectedRepositoryId: '999',
    })).toThrow(/repository identity mismatch/);
    expect(() => buildGitHubExecutionIdentity(githubEnv(), {
      sourceRevision: SOURCE,
      expectedOwnerId: '999',
    })).toThrow(/repository owner identity mismatch/);
  });

  it('strictly validates the WIF credential file and rejects long-lived key-shaped fields', () => {
    const parsed = parseCredentialConfig(credentialConfig(), {
      workloadIdentityProvider: PROVIDER,
      serviceAccount: DEPLOY_SA,
    });
    expect(parsed.configSha256).toMatch(/^[a-f0-9]{64}$/);

    expect(() => parseCredentialConfig(credentialConfig({ token_url: 'https://example.invalid/sts' }), {
      workloadIdentityProvider: PROVIDER,
      serviceAccount: DEPLOY_SA,
    })).toThrow(/STS endpoint drifted/);
    expect(() => parseCredentialConfig(credentialConfig({ private_key: 'forbidden' }), {
      workloadIdentityProvider: PROVIDER,
      serviceAccount: DEPLOY_SA,
    })).toThrow(/long-lived credential field is forbidden/);
  });

  it('binds credential evidence to execution identity, token hash and authoritative Cloud Run response hash', () => {
    const executionIdentity = buildGitHubExecutionIdentity(githubEnv(), {
      sourceRevision: SOURCE,
    });
    const cloudRunRaw = JSON.stringify({
      name: 'projects/proofleet-test-12345/locations/europe-west1/services/prooffleet',
      uid: '12345678-abcd-4abc-8def-123456789abc',
      uri: 'https://prooffleet.example.run.app',
      template: {
        serviceAccount: '123456789012-compute@developer.gserviceaccount.com',
      },
    });
    const evidence = buildCredentialEvidence({
      executionIdentity,
      credentialConfigRaw: credentialConfig(),
      accessToken: 'ya29.this-is-a-short-lived-test-access-token-value',
      cloudRunServiceRaw: cloudRunRaw,
      workloadIdentityProvider: PROVIDER,
      deployServiceAccount: DEPLOY_SA,
      projectId: 'proofleet-test-12345',
      region: 'europe-west1',
      service: 'prooffleet',
    });

    expect(evidence.githubRunId).toBe('32516371741');
    expect(evidence.accessTokenSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.cloudRunResponseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.cloudRunServiceUid).toBe('12345678-abcd-4abc-8def-123456789abc');
    expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(evidence)).not.toContain('ya29.this-is-a-short-lived-test-access-token-value');
  });

  it('fails closed when Cloud Run v2 response fields drift instead of guessing alternative paths', () => {
    const executionIdentity = buildGitHubExecutionIdentity(githubEnv(), { sourceRevision: SOURCE });
    expect(() => buildCredentialEvidence({
      executionIdentity,
      credentialConfigRaw: credentialConfig(),
      accessToken: 'ya29.this-is-a-short-lived-test-access-token-value',
      cloudRunServiceRaw: JSON.stringify({
        metadata: { name: 'projects/proofleet-test-12345/locations/europe-west1/services/prooffleet' },
        uid: '12345678-abcd-4abc-8def-123456789abc',
        uri: 'https://prooffleet.example.run.app',
        template: { serviceAccount: '123456789012-compute@developer.gserviceaccount.com' },
      }),
      workloadIdentityProvider: PROVIDER,
      deployServiceAccount: DEPLOY_SA,
      projectId: 'proofleet-test-12345',
      region: 'europe-west1',
      service: 'prooffleet',
    })).toThrow(/resource drifted/);
  });

  it('parses the exact candidate deploy response shape and rejects parser drift', () => {
    const exact = JSON.stringify({
      spec: {
        template: {
          metadata: {
            name: 'prooffleet-00001-abc',
            labels: {
              'prooffleet-source-sha': SOURCE,
              'prooffleet-candidate': 'true',
            },
          },
          spec: {
            containers: [{
              image: `europe-west1-docker.pkg.dev/p/r/s@${INDEX}`,
              env: [{ name: 'PROOFFLEET_SOURCE_REVISION', value: SOURCE }],
            }],
          },
        },
      },
    });
    expect(parseCandidateDeployResponse(exact, {
      expectedSourceRevision: SOURCE,
      expectedImageIndexDigest: INDEX,
    }).revisionName).toBe('prooffleet-00001-abc');

    const drifted = JSON.stringify({
      status: { latestCreatedRevisionName: 'prooffleet-00001-abc' },
      spec: { template: { metadata: { labels: {} }, spec: { containers: [] } } },
    });
    expect(() => parseCandidateDeployResponse(drifted, {
      expectedSourceRevision: SOURCE,
      expectedImageIndexDigest: INDEX,
    })).toThrow(/revision name/);
  });

  it('requires exact revision identity, uid, runtime identity, runtime digest and provider Ready state', () => {
    const runtimeImage = `europe-west1-docker.pkg.dev/p/r/s@${RUNTIME}`;
    const parsed = parseCandidateRevisionReadback(JSON.stringify({
      metadata: {
        name: 'prooffleet-00001-abc',
        uid: 'revision-uid-12345678',
        labels: {
          'prooffleet-source-sha': SOURCE,
          'prooffleet-candidate': 'true',
        },
      },
      spec: {
        serviceAccountName: '123456789012-compute@developer.gserviceaccount.com',
        containers: [{
          image: runtimeImage,
          env: [
            { name: 'PROOFFLEET_SOURCE_REVISION', value: SOURCE },
            { name: 'OTHER', value: 'preserved' },
          ],
        }],
      },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    }), {
      expectedRevisionName: 'prooffleet-00001-abc',
      expectedSourceRevision: SOURCE,
      expectedRuntimeImage: runtimeImage,
      expectedRuntimeServiceAccount: '123456789012-compute@developer.gserviceaccount.com',
    });
    expect(parsed.revisionUid).toBe('revision-uid-12345678');
    expect(parsed.environmentNames).toContain('OTHER');

    expect(() => parseCandidateRevisionReadback(JSON.stringify({
      metadata: {
        name: 'prooffleet-00001-abc',
        uid: 'revision-uid-12345678',
        labels: { 'prooffleet-source-sha': SOURCE, 'prooffleet-candidate': 'true' },
      },
      spec: {
        template: {
          spec: {
            serviceAccountName: '123456789012-compute@developer.gserviceaccount.com',
            containers: [{ image: runtimeImage, env: [{ name: 'PROOFFLEET_SOURCE_REVISION', value: SOURCE }] }],
          },
        },
      },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    }), {
      expectedRevisionName: 'prooffleet-00001-abc',
      expectedSourceRevision: SOURCE,
      expectedRuntimeImage: runtimeImage,
      expectedRuntimeServiceAccount: '123456789012-compute@developer.gserviceaccount.com',
    })).toThrow(/serviceAccountName/);
  });

  it('requires a service uid, exact candidate tag URL and zero normal traffic', () => {
    const parsed = parseCandidateServiceTrafficReadback(JSON.stringify({
      metadata: { uid: 'service-uid-12345678' },
      status: {
        traffic: [{
          revisionName: 'prooffleet-00001-abc',
          tag: 'pf-aaaaaaaaaaaa',
          percent: 0,
          url: 'https://pf-aaaaaaaaaaaa---prooffleet.example.run.app',
        }],
      },
    }), {
      expectedRevisionName: 'prooffleet-00001-abc',
      candidateTag: 'pf-aaaaaaaaaaaa',
    });
    expect(parsed.trafficPercent).toBe(0);
    expect(parsed.serviceUid).toBe('service-uid-12345678');
  });

  it('seals receipts and artifact bindings against run or artifact substitution', () => {
    const executionIdentity = buildGitHubExecutionIdentity(githubEnv(), { sourceRevision: SOURCE });
    const sealed = sealReceipt({ schemaVersion: 'example.v1', outcome: 'OBSERVED', sourceRevision: SOURCE });
    expect(sealed.receiptHash).toMatch(/^[a-f0-9]{64}$/);

    const binding = buildArtifactBinding({
      executionIdentity,
      receiptHash: sealed.receiptHash,
      artifactName: 'prooffleet-example',
      artifactId: '9458987801',
      artifactDigest: `sha256:${'d'.repeat(64)}`,
    });
    expect(binding.githubRunId).toBe('32516371741');
    expect(binding.bindingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => buildArtifactBinding({
      executionIdentity,
      receiptHash: sealed.receiptHash,
      artifactName: 'prooffleet-example',
      artifactId: 'not-an-id',
      artifactDigest: `sha256:${'d'.repeat(64)}`,
    })).toThrow(/positive numeric identity/);
  });
});
