import { describe, expect, it } from 'vitest';

import { verifyWifIdentity } from '../scripts/verify-wif-identity.mjs';

const PROVIDER = 'projects/123456789012/locations/global/workloadIdentityPools/prooffleet-github/providers/prooffleet-repo';
const SERVICE_ACCOUNT = 'prooffleet-deploy@project-b29d4703-a302-4b05-b2e.iam.gserviceaccount.com';
const PROJECT_ID = 'project-b29d4703-a302-4b05-b2e';

function credential(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'external_account',
    audience: '//iam.googleapis.com/' + PROVIDER,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    credential_source: {
      url: 'https://pipelines.actions.githubusercontent.com/example/idtoken?api-version=2.0&audience=proofleet',
      headers: { Authorization: 'Bearer short-lived-runner-token' },
      format: { type: 'json', subject_token_field_name: 'value' },
    },
    service_account_impersonation_url:
      'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + SERVICE_ACCOUNT + ':generateAccessToken',
    ...overrides,
  });
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    rawCredentialJson: credential(),
    expectedProvider: PROVIDER,
    expectedServiceAccount: SERVICE_ACCOUNT,
    observedPrincipal: SERVICE_ACCOUNT,
    observedProjectId: PROJECT_ID,
    observedProjectNumber: '123456789012',
    expectedProjectId: PROJECT_ID,
    ...overrides,
  };
}

describe('WIF identity verifier', () => {
  it('binds the actual principal, project number and secret-free configuration hash to one expected federation', () => {
    const verified = verifyWifIdentity(input());
    expect(verified).toMatchObject({ principal: SERVICE_ACCOUNT, projectId: PROJECT_ID, projectNumber: '123456789012' });
    expect(verified.principalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verified.credentialConfigSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not let a short-lived bearer value change the secret-free configuration hash', () => {
    const first = verifyWifIdentity(input());
    const parsed = JSON.parse(credential()) as Record<string, unknown>;
    const source = parsed.credential_source as Record<string, unknown>;
    const headers = source.headers as Record<string, unknown>;
    headers.Authorization = 'Bearer another-short-lived-token';
    const second = verifyWifIdentity(input({ rawCredentialJson: JSON.stringify(parsed) }));
    expect(first.credentialConfigSha256).toBe(second.credentialConfigSha256);
  });

  it('blocks wrong principal, wrong project number, audience drift and unknown credential fields', () => {
    expect(() => verifyWifIdentity(input({ observedPrincipal: 'other@project-b29d4703-a302-4b05-b2e.iam.gserviceaccount.com' }))).toThrow(/principal/);
    expect(() => verifyWifIdentity(input({ observedProjectNumber: '123456789013' }))).toThrow(/project number/);
    expect(() => verifyWifIdentity(input({ rawCredentialJson: credential({ audience: '//iam.googleapis.com/projects/9/locations/global/workloadIdentityPools/x/providers/y' }) }))).toThrow(/audience/);
    expect(() => verifyWifIdentity(input({ rawCredentialJson: credential({ unapproved_field: true }) }))).toThrow(/shape drifted/);
  });
});
