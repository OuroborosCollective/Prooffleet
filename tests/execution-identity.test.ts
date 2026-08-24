import { describe, expect, it } from 'vitest';

import {
  bindExecutionToCredential,
  buildGithubExecutionIdentity,
  parseGoogleWifCredentialEvidence,
} from '../server/evidence/executionIdentity';

const SHA = 'a'.repeat(40);
const PROVIDER = 'projects/123456789012/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo';
const SERVICE_ACCOUNT = 'prooffleet-github@prooffleet-test1.iam.gserviceaccount.com';

function executionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GITHUB_REPOSITORY_ID: '1339097875',
    GITHUB_REPOSITORY_OWNER_ID: '266194342',
    GITHUB_ACTOR_ID: '266194342',
    GITHUB_RUN_ID: '32516371741',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: SHA,
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    RUNNER_NAME: 'GitHub Actions 1000221664',
    ...overrides,
  };
}

function credential(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'external_account',
    audience: `//iam.googleapis.com/${PROVIDER}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    credential_source: {
      url: 'https://pipelines.actions.githubusercontent.com/example/idtoken?api-version=2.0&audience=proofleet',
      headers: {
        Authorization: 'Bearer runner-request-token',
      },
      format: {
        type: 'json',
        subject_token_field_name: 'value',
      },
    },
    service_account_impersonation_url:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SERVICE_ACCOUNT}:generateAccessToken`,
    ...overrides,
  });
}

describe('immutable execution identity', () => {
  it('binds numeric repository/owner/actor/run identities, exact source and runner fingerprint', () => {
    const identity = buildGithubExecutionIdentity(executionEnv(), SHA);
    expect(identity).toMatchObject({
      repositoryId: '1339097875',
      repositoryOwnerId: '266194342',
      actorId: '266194342',
      workflowRunId: '32516371741',
      workflowRunAttempt: '1',
      sourceRevision: SHA,
      runnerEnvironment: 'github-hosted',
      runnerOs: 'Linux',
      runnerArch: 'X64',
    });
    expect(identity.runnerNameHash).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.identityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(identity)).not.toContain('GitHub Actions 1000221664');
  });

  it('changes identity when owner, run attempt or source revision changes', () => {
    const first = buildGithubExecutionIdentity(executionEnv());
    const ownerChanged = buildGithubExecutionIdentity(executionEnv({ GITHUB_REPOSITORY_OWNER_ID: '266194343' }));
    const second = buildGithubExecutionIdentity(executionEnv({ GITHUB_RUN_ATTEMPT: '2' }));
    const third = buildGithubExecutionIdentity(executionEnv({ GITHUB_SHA: 'b'.repeat(40) }));
    expect(first.identityHash).not.toBe(ownerChanged.identityHash);
    expect(first.identityHash).not.toBe(second.identityHash);
    expect(first.identityHash).not.toBe(third.identityHash);
  });

  it('fails closed on missing, zero, nonnumeric or mismatched GitHub identities', () => {
    expect(() => buildGithubExecutionIdentity(executionEnv({ GITHUB_REPOSITORY_ID: '' })))
      .toThrow('GITHUB_REPOSITORY_ID is required');
    expect(() => buildGithubExecutionIdentity(executionEnv({ GITHUB_REPOSITORY_OWNER_ID: '0' })))
      .toThrow('positive decimal identifier');
    expect(() => buildGithubExecutionIdentity(executionEnv({ GITHUB_RUN_ID: '0' })))
      .toThrow('positive decimal identifier');
    expect(() => buildGithubExecutionIdentity(executionEnv({ GITHUB_ACTOR_ID: 'owner-user' })))
      .toThrow('positive decimal identifier');
    expect(() => buildGithubExecutionIdentity(executionEnv(), 'b'.repeat(40)))
      .toThrow('does not match expected source revision');
  });

  it('rejects unknown runner representations instead of guessing', () => {
    expect(() => buildGithubExecutionIdentity(executionEnv({ RUNNER_ENVIRONMENT: 'mystery' })))
      .toThrow('RUNNER_ENVIRONMENT');
    expect(() => buildGithubExecutionIdentity(executionEnv({ RUNNER_OS: 'Plan9' })))
      .toThrow('RUNNER_OS');
    expect(() => buildGithubExecutionIdentity(executionEnv({ RUNNER_ARCH: 'RISCV64' })))
      .toThrow('RUNNER_ARCH');
  });
});

describe('Google WIF credential evidence parser', () => {
  it('accepts the exact google-github-actions external-account shape without returning secret headers', () => {
    const raw = credential();
    const evidence = parseGoogleWifCredentialEvidence(raw, PROVIDER, SERVICE_ACCOUNT);
    expect(evidence).toMatchObject({
      configShapeVersion: 'google-github-actions-auth-external-account.v1',
      credentialType: 'external_account',
      wifProvider: PROVIDER,
      wifProviderProjectNumber: '123456789012',
      serviceAccount: SERVICE_ACCOUNT,
      audience: `//iam.googleapis.com/${PROVIDER}`,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      tokenUrl: 'https://sts.googleapis.com/v1/token',
      credentialSourceHost: 'pipelines.actions.githubusercontent.com',
    });
    expect(evidence.credentialConfigSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(evidence)).not.toContain('runner-request-token');
    expect(JSON.stringify(evidence)).not.toContain('Authorization');
  });

  it('hashes only validated non-secret configuration, not the short-lived bearer value', () => {
    const first = parseGoogleWifCredentialEvidence(credential(), PROVIDER, SERVICE_ACCOUNT);
    const parsed = JSON.parse(credential()) as Record<string, unknown>;
    const source = parsed.credential_source as Record<string, unknown>;
    const headers = source.headers as Record<string, unknown>;
    headers.Authorization = 'Bearer completely-different-short-lived-token';
    const second = parseGoogleWifCredentialEvidence(JSON.stringify(parsed), PROVIDER, SERVICE_ACCOUNT);
    expect(first.credentialConfigSha256).toBe(second.credentialConfigSha256);
  });

  it('fails on top-level or nested parser drift instead of ignoring extra fields', () => {
    expect(() => parseGoogleWifCredentialEvidence(
      credential({ future_field: 'silently-ignore-me' }), PROVIDER, SERVICE_ACCOUNT,
    )).toThrow('shape drifted');

    const parsed = JSON.parse(credential()) as Record<string, unknown>;
    const source = parsed.credential_source as Record<string, unknown>;
    source.future_field = true;
    expect(() => parseGoogleWifCredentialEvidence(JSON.stringify(parsed), PROVIDER, SERVICE_ACCOUNT))
      .toThrow('credential_source shape drifted');
  });

  it('fails if audience, token endpoint, source host or impersonated account diverges', () => {
    expect(() => parseGoogleWifCredentialEvidence(
      credential({ audience: '//iam.googleapis.com/projects/9/locations/global/workloadIdentityPools/x/providers/y' }),
      PROVIDER,
      SERVICE_ACCOUNT,
    )).toThrow('audience');

    expect(() => parseGoogleWifCredentialEvidence(
      credential({ token_url: 'https://evil.example/token' }), PROVIDER, SERVICE_ACCOUNT,
    )).toThrow('STS token URL');

    const badHost = JSON.parse(credential()) as Record<string, unknown>;
    (badHost.credential_source as Record<string, unknown>).url = 'https://evil.example/idtoken';
    expect(() => parseGoogleWifCredentialEvidence(JSON.stringify(badHost), PROVIDER, SERVICE_ACCOUNT))
      .toThrow('GitHub Actions HTTPS identity endpoint');

    expect(() => parseGoogleWifCredentialEvidence(
      credential({
        service_account_impersonation_url:
          'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/other@prooffleet-test1.iam.gserviceaccount.com:generateAccessToken',
      }),
      PROVIDER,
      SERVICE_ACCOUNT,
    )).toThrow('impersonation target');
  });

  it('binds execution identity and secret-free credential configuration into a deterministic conjunction hash', () => {
    const execution = buildGithubExecutionIdentity(executionEnv());
    const firstCredential = parseGoogleWifCredentialEvidence(credential(), PROVIDER, SERVICE_ACCOUNT);
    const first = bindExecutionToCredential(execution, firstCredential);
    const second = bindExecutionToCredential(
      buildGithubExecutionIdentity(executionEnv({ GITHUB_RUN_ATTEMPT: '2' })),
      firstCredential,
    );
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });
});
