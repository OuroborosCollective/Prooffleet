import { canonicalJson, sha256Hex } from './canonicalJson';
import { requireExactGitRevision } from '../revisionIdentity';

const POSITIVE_DECIMAL = /^[1-9]\d*$/;
const SERVICE_ACCOUNT_EMAIL = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/;
const WIF_PROVIDER = /^projects\/([1-9]\d*)\/locations\/global\/workloadIdentityPools\/([A-Za-z0-9._-]+)\/providers\/([A-Za-z0-9._-]+)$/;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function requirePositiveDecimal(label: string, value: string): string {
  if (!POSITIVE_DECIMAL.test(value)) {
    throw new Error(`${label} must be a positive decimal identifier`);
  }
  return value;
}

function requireNonEmpty(label: string, value: string): string {
  if (!value || value.length > 256 || /[\r\n\0]/.test(value)) {
    throw new Error(`${label} must be a bounded single-line value`);
  }
  return value;
}

function requireExactKeys(label: string, value: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} shape drifted: expected keys ${wanted.join(',')}, got ${actual.join(',')}`);
  }
}

function asRecord(label: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export interface GithubExecutionIdentity {
  repositoryId: string;
  repositoryOwnerId: string;
  actorId: string;
  workflowRunId: string;
  workflowRunAttempt: string;
  sourceRevision: string;
  runnerEnvironment: 'github-hosted' | 'self-hosted';
  runnerOs: 'Linux' | 'Windows' | 'macOS';
  runnerArch: 'X64' | 'ARM64' | 'ARM' | 'X86';
  runnerNameHash: string;
  identityHash: string;
}

/**
 * Builds a run-scoped identity from GitHub's immutable numeric IDs and exact
 * checked source revision. Mutable display names, labels and workflow paths
 * are intentionally excluded from the authoritative identity body.
 */
export function buildGithubExecutionIdentity(
  env: NodeJS.ProcessEnv,
  expectedSourceRevision?: string,
): GithubExecutionIdentity {
  const repositoryId = requirePositiveDecimal('GITHUB_REPOSITORY_ID', required(env, 'GITHUB_REPOSITORY_ID'));
  const repositoryOwnerId = requirePositiveDecimal(
    'GITHUB_REPOSITORY_OWNER_ID',
    required(env, 'GITHUB_REPOSITORY_OWNER_ID'),
  );
  const actorId = requirePositiveDecimal('GITHUB_ACTOR_ID', required(env, 'GITHUB_ACTOR_ID'));
  const workflowRunId = requirePositiveDecimal('GITHUB_RUN_ID', required(env, 'GITHUB_RUN_ID'));
  const workflowRunAttempt = requirePositiveDecimal('GITHUB_RUN_ATTEMPT', required(env, 'GITHUB_RUN_ATTEMPT'));
  const sourceRevision = requireExactGitRevision(required(env, 'GITHUB_SHA'));

  if (expectedSourceRevision !== undefined) {
    const expected = requireExactGitRevision(expectedSourceRevision);
    if (sourceRevision !== expected) {
      throw new Error(`GITHUB_SHA ${sourceRevision} does not match expected source revision ${expected}`);
    }
  }

  const runnerEnvironment = required(env, 'RUNNER_ENVIRONMENT');
  if (runnerEnvironment !== 'github-hosted' && runnerEnvironment !== 'self-hosted') {
    throw new Error('RUNNER_ENVIRONMENT must be github-hosted or self-hosted');
  }

  const runnerOs = required(env, 'RUNNER_OS');
  if (!['Linux', 'Windows', 'macOS'].includes(runnerOs)) {
    throw new Error('RUNNER_OS is unsupported');
  }

  const runnerArch = required(env, 'RUNNER_ARCH');
  if (!['X64', 'ARM64', 'ARM', 'X86'].includes(runnerArch)) {
    throw new Error('RUNNER_ARCH is unsupported');
  }

  const runnerName = requireNonEmpty('RUNNER_NAME', required(env, 'RUNNER_NAME'));
  const body = {
    repositoryId,
    repositoryOwnerId,
    actorId,
    workflowRunId,
    workflowRunAttempt,
    sourceRevision,
    runnerEnvironment: runnerEnvironment as GithubExecutionIdentity['runnerEnvironment'],
    runnerOs: runnerOs as GithubExecutionIdentity['runnerOs'],
    runnerArch: runnerArch as GithubExecutionIdentity['runnerArch'],
    runnerNameHash: sha256Hex(runnerName),
  };

  return {
    ...body,
    identityHash: sha256Hex(canonicalJson(body)),
  };
}

export interface GoogleWifCredentialEvidence {
  configShapeVersion: 'google-github-actions-auth-external-account.v1';
  credentialType: 'external_account';
  wifProvider: string;
  wifProviderProjectNumber: string;
  serviceAccount: string;
  audience: string;
  subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt';
  tokenUrl: 'https://sts.googleapis.com/v1/token';
  credentialSourceHost: string;
  credentialConfigSha256: string;
}

/**
 * Strictly validates the non-secret structure produced by
 * google-github-actions/auth for WIF-through-service-account credentials.
 * Unknown/missing fields fail closed so upstream parser drift cannot silently
 * weaken the evidence chain. Secret-bearing credential_source headers are
 * validated for presence but are neither returned nor included in the hash.
 */
export function parseGoogleWifCredentialEvidence(
  rawCredentialJson: string,
  expectedProvider: string,
  expectedServiceAccount: string,
): GoogleWifCredentialEvidence {
  const providerMatch = WIF_PROVIDER.exec(expectedProvider);
  if (!providerMatch) throw new Error('expected WIF provider is malformed');
  if (!SERVICE_ACCOUNT_EMAIL.test(expectedServiceAccount)) {
    throw new Error('expected WIF service account is malformed');
  }
  if (!rawCredentialJson || rawCredentialJson.length > 128_000) {
    throw new Error('credential configuration is empty or unexpectedly large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawCredentialJson);
  } catch {
    throw new Error('credential configuration is not valid JSON');
  }

  const top = asRecord('credential configuration', parsed);
  requireExactKeys('credential configuration', top, [
    'audience',
    'credential_source',
    'service_account_impersonation_url',
    'subject_token_type',
    'token_url',
    'type',
  ]);

  if (top.type !== 'external_account') throw new Error('credential type is not external_account');
  const audience = `//iam.googleapis.com/${expectedProvider}`;
  if (top.audience !== audience) throw new Error('credential audience does not match expected WIF provider');
  if (top.subject_token_type !== 'urn:ietf:params:oauth:token-type:jwt') {
    throw new Error('credential subject token type drifted');
  }
  if (top.token_url !== 'https://sts.googleapis.com/v1/token') {
    throw new Error('credential STS token URL drifted');
  }

  const source = asRecord('credential_source', top.credential_source);
  requireExactKeys('credential_source', source, ['format', 'headers', 'url']);
  if (typeof source.url !== 'string') throw new Error('credential_source.url must be a string');
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source.url);
  } catch {
    throw new Error('credential_source.url is malformed');
  }
  if (sourceUrl.protocol !== 'https:' || !sourceUrl.hostname.endsWith('.actions.githubusercontent.com')) {
    throw new Error('credential source is not a GitHub Actions HTTPS identity endpoint');
  }

  const headers = asRecord('credential_source.headers', source.headers);
  requireExactKeys('credential_source.headers', headers, ['Authorization']);
  const authorization = headers.Authorization;
  if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) {
    throw new Error('credential source authorization header is missing or malformed');
  }

  const format = asRecord('credential_source.format', source.format);
  requireExactKeys('credential_source.format', format, ['subject_token_field_name', 'type']);
  if (format.type !== 'json' || format.subject_token_field_name !== 'value') {
    throw new Error('credential source token format drifted');
  }

  if (typeof top.service_account_impersonation_url !== 'string') {
    throw new Error('service account impersonation URL is missing');
  }
  let impersonationUrl: URL;
  try {
    impersonationUrl = new URL(top.service_account_impersonation_url);
  } catch {
    throw new Error('service account impersonation URL is malformed');
  }
  if (impersonationUrl.protocol !== 'https:' || impersonationUrl.hostname !== 'iamcredentials.googleapis.com') {
    throw new Error('service account impersonation endpoint drifted');
  }
  const accountMatch = /^\/v1\/projects\/-\/serviceAccounts\/([^/]+):generateAccessToken$/.exec(
    impersonationUrl.pathname,
  );
  const observedServiceAccount = accountMatch ? decodeURIComponent(accountMatch[1]) : '';
  if (observedServiceAccount !== expectedServiceAccount) {
    throw new Error('credential impersonation target does not match expected service account');
  }

  const evidenceWithoutHash = {
    configShapeVersion: 'google-github-actions-auth-external-account.v1' as const,
    credentialType: 'external_account' as const,
    wifProvider: expectedProvider,
    wifProviderProjectNumber: providerMatch[1],
    serviceAccount: expectedServiceAccount,
    audience,
    subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt' as const,
    tokenUrl: 'https://sts.googleapis.com/v1/token' as const,
    credentialSourceHost: sourceUrl.hostname,
  };

  const secretFreeConfig = {
    ...evidenceWithoutHash,
    credentialSourceOrigin: sourceUrl.origin,
    credentialSourcePath: sourceUrl.pathname,
    credentialSourceQueryKeys: [...sourceUrl.searchParams.keys()].sort(),
    authorizationScheme: 'Bearer',
    tokenFormat: {
      type: 'json',
      subjectTokenFieldName: 'value',
    },
    impersonationOrigin: impersonationUrl.origin,
    impersonationPath: impersonationUrl.pathname,
  };

  return {
    ...evidenceWithoutHash,
    credentialConfigSha256: sha256Hex(canonicalJson(secretFreeConfig)),
  };
}

export function bindExecutionToCredential(
  executionIdentity: GithubExecutionIdentity,
  credentialEvidence: GoogleWifCredentialEvidence,
): string {
  return sha256Hex(canonicalJson({
    executionIdentityHash: executionIdentity.identityHash,
    credentialConfigSha256: credentialEvidence.credentialConfigSha256,
    wifProvider: credentialEvidence.wifProvider,
    projectNumber: credentialEvidence.wifProviderProjectNumber,
    serviceAccount: credentialEvidence.serviceAccount,
  }));
}
