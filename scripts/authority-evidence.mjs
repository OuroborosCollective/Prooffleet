import { createHash } from 'node:crypto';

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;
const NUMERIC_ID = /^[1-9][0-9]*$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return createHash('sha256').update(bytes).digest('hex');
}

export function requireExactSha(label, value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!SHA40.test(normalized)) {
    throw new Error(`${label} must be an exact lowercase 40-character Git SHA`);
  }
  return normalized;
}

export function requireSha256Hex(label, value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!SHA256_HEX.test(normalized)) {
    throw new Error(`${label} must be an exact lowercase SHA-256 hex value`);
  }
  return normalized;
}

export function requireSha256Digest(label, value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!SHA256_DIGEST.test(normalized)) {
    throw new Error(`${label} must be an immutable sha256 digest`);
  }
  return normalized;
}

export function requireNumericId(label, value) {
  const normalized = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  if (!NUMERIC_ID.test(normalized)) {
    throw new Error(`${label} must be a positive numeric identity`);
  }
  return normalized;
}

function requireString(label, value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function parseJsonObject(label, raw) {
  let value;
  try {
    value = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

export function buildGitHubExecutionIdentity(
  env,
  { sourceRevision, expectedRepositoryId, expectedOwnerId } = {},
) {
  const sourceSha = requireExactSha('sourceRevision', sourceRevision);
  const repositoryId = requireNumericId('GITHUB_REPOSITORY_ID', env.GITHUB_REPOSITORY_ID);
  const repositoryOwnerId = requireNumericId(
    'GITHUB_REPOSITORY_OWNER_ID',
    env.GITHUB_REPOSITORY_OWNER_ID,
  );
  const actorId = requireNumericId('GITHUB_ACTOR_ID', env.GITHUB_ACTOR_ID);
  const runId = requireNumericId('GITHUB_RUN_ID', env.GITHUB_RUN_ID);
  const runAttempt = requireNumericId('GITHUB_RUN_ATTEMPT', env.GITHUB_RUN_ATTEMPT);
  const runnerName = requireString('RUNNER_NAME', env.RUNNER_NAME);
  const runnerOs = requireString('RUNNER_OS', env.RUNNER_OS);
  const runnerArch = requireString('RUNNER_ARCH', env.RUNNER_ARCH);

  if (expectedRepositoryId !== undefined) {
    const expected = requireNumericId('expectedRepositoryId', expectedRepositoryId);
    if (repositoryId !== expected) {
      throw new Error(`repository identity mismatch: expected ${expected}, got ${repositoryId}`);
    }
  }
  if (expectedOwnerId !== undefined) {
    const expected = requireNumericId('expectedOwnerId', expectedOwnerId);
    if (repositoryOwnerId !== expected) {
      throw new Error(`repository owner identity mismatch: expected ${expected}, got ${repositoryOwnerId}`);
    }
  }

  const body = {
    schemaVersion: 'prooffleet.github-execution-identity.v1',
    sourceRevision: sourceSha,
    repositoryId,
    repositoryOwnerId,
    actorId,
    runId,
    runAttempt,
    runner: {
      nameSha256: sha256Hex(runnerName),
      os: runnerOs,
      arch: runnerArch,
      nodeVersion: process.version,
    },
  };

  return {
    ...body,
    identityHash: sha256Hex(canonicalJson(body)),
  };
}

export function parseCredentialConfig(raw, {
  workloadIdentityProvider,
  serviceAccount,
}) {
  const config = parseJsonObject('credential configuration', raw);
  const provider = requireString('workloadIdentityProvider', workloadIdentityProvider);
  const account = requireString('serviceAccount', serviceAccount);
  const expectedAudience = `//iam.googleapis.com/${provider}`;
  const expectedImpersonationUrl =
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`;

  if (config.type !== 'external_account') {
    throw new Error(`credential configuration type drifted: ${String(config.type || '<missing>')}`);
  }
  if (config.audience !== expectedAudience) {
    throw new Error('credential configuration audience does not match the exact WIF provider');
  }
  if (config.subject_token_type !== 'urn:ietf:params:oauth:token-type:jwt') {
    throw new Error('credential configuration subject token type drifted');
  }
  if (config.token_url !== 'https://sts.googleapis.com/v1/token') {
    throw new Error('credential configuration STS endpoint drifted');
  }
  if (config.service_account_impersonation_url !== expectedImpersonationUrl) {
    throw new Error('credential configuration impersonation target drifted');
  }
  for (const forbidden of ['private_key', 'private_key_id', 'client_email']) {
    if (Object.prototype.hasOwnProperty.call(config, forbidden)) {
      throw new Error(`long-lived credential field is forbidden: ${forbidden}`);
    }
  }

  return {
    audience: expectedAudience,
    serviceAccount: account,
    configSha256: sha256Hex(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')),
  };
}

export function parseCloudRunV2Service(raw, {
  projectId,
  region,
  service,
}) {
  const value = parseJsonObject('Cloud Run v2 service readback', raw);
  if (value.error) throw new Error('Cloud Run v2 service readback returned an error object');

  const expectedName = `projects/${requireString('projectId', projectId)}/locations/${requireString('region', region)}/services/${requireString('service', service)}`;
  if (value.name !== expectedName) {
    throw new Error(`Cloud Run v2 service resource drifted: ${String(value.name || '<missing>')}`);
  }

  const uid = requireString('Cloud Run service uid', value.uid);
  if (!/^[A-Za-z0-9-]{8,}$/.test(uid)) {
    throw new Error('Cloud Run service uid is malformed');
  }
  const uri = requireString('Cloud Run service uri', value.uri);
  if (!/^https:\/\//.test(uri)) throw new Error('Cloud Run service uri is malformed');
  const runtimeServiceAccount = requireString(
    'Cloud Run runtime service account',
    value.template?.serviceAccount,
  );
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/.test(runtimeServiceAccount)) {
    throw new Error('Cloud Run runtime service account is malformed');
  }

  return {
    name: expectedName,
    uid,
    uri,
    runtimeServiceAccount,
    responseSha256: sha256Hex(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')),
  };
}

export function buildCredentialEvidence({
  executionIdentity,
  credentialConfigRaw,
  accessToken,
  cloudRunServiceRaw,
  workloadIdentityProvider,
  deployServiceAccount,
  projectId,
  region,
  service,
}) {
  if (executionIdentity?.schemaVersion !== 'prooffleet.github-execution-identity.v1') {
    throw new Error('execution identity schema is missing or unsupported');
  }
  const identityHash = requireSha256Hex('executionIdentity.identityHash', executionIdentity.identityHash);
  const token = requireString('WIF access token', accessToken);
  if (token.length < 20) throw new Error('WIF access token is implausibly short');

  const config = parseCredentialConfig(credentialConfigRaw, {
    workloadIdentityProvider,
    serviceAccount: deployServiceAccount,
  });
  const cloudRun = parseCloudRunV2Service(cloudRunServiceRaw, {
    projectId,
    region,
    service,
  });

  const body = {
    schemaVersion: 'prooffleet.gcp-credential-evidence.v1',
    sourceRevision: requireExactSha('executionIdentity.sourceRevision', executionIdentity.sourceRevision),
    githubExecutionIdentityHash: identityHash,
    githubRepositoryId: requireNumericId('executionIdentity.repositoryId', executionIdentity.repositoryId),
    githubRepositoryOwnerId: requireNumericId(
      'executionIdentity.repositoryOwnerId',
      executionIdentity.repositoryOwnerId,
    ),
    githubActorId: requireNumericId('executionIdentity.actorId', executionIdentity.actorId),
    githubRunId: requireNumericId('executionIdentity.runId', executionIdentity.runId),
    githubRunAttempt: requireNumericId('executionIdentity.runAttempt', executionIdentity.runAttempt),
    workloadIdentityProvider: requireString('workloadIdentityProvider', workloadIdentityProvider),
    deployServiceAccount: requireString('deployServiceAccount', deployServiceAccount),
    credentialConfigSha256: config.configSha256,
    accessTokenSha256: sha256Hex(token),
    cloudRunServiceName: cloudRun.name,
    cloudRunServiceUid: cloudRun.uid,
    cloudRunServiceUri: cloudRun.uri,
    cloudRunRuntimeServiceAccount: cloudRun.runtimeServiceAccount,
    cloudRunResponseSha256: cloudRun.responseSha256,
  };

  return {
    ...body,
    evidenceHash: sha256Hex(canonicalJson(body)),
  };
}

export function parseCandidateDeployResponse(raw, {
  expectedSourceRevision,
  expectedImageIndexDigest,
}) {
  const deployed = parseJsonObject('Cloud Run deploy response', raw);
  const sourceRevision = requireExactSha('expectedSourceRevision', expectedSourceRevision);
  const imageIndexDigest = requireSha256Digest(
    'expectedImageIndexDigest',
    expectedImageIndexDigest,
  );

  const revisionName = requireString(
    'direct deploy revision name',
    deployed.spec?.template?.metadata?.name,
  );
  const labels = deployed.spec?.template?.metadata?.labels;
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
    throw new Error('direct deploy response labels drifted');
  }
  if (labels['prooffleet-source-sha'] !== sourceRevision) {
    throw new Error('direct deploy response source label mismatch');
  }
  if (String(labels['prooffleet-candidate']) !== 'true') {
    throw new Error('direct deploy response candidate marker missing');
  }

  const container = deployed.spec?.template?.spec?.containers?.[0];
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    throw new Error('direct deploy response container shape drifted');
  }
  const image = requireString('direct deploy response image', container.image);
  if (!image.endsWith(`@${imageIndexDigest}`)) {
    throw new Error('direct deploy response image index digest mismatch');
  }
  const env = Array.isArray(container.env) ? container.env : [];
  const source = env.find((entry) => entry?.name === 'PROOFFLEET_SOURCE_REVISION')?.value;
  if (source !== sourceRevision) throw new Error('direct deploy response source env mismatch');

  return {
    revisionName,
    responseSha256: sha256Hex(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')),
  };
}

export function parseCandidateRevisionReadback(raw, {
  expectedRevisionName,
  expectedSourceRevision,
  expectedRuntimeImage,
  expectedRuntimeServiceAccount,
}) {
  const revision = parseJsonObject('Cloud Run revision readback', raw);
  const revisionName = requireString('revision.metadata.name', revision.metadata?.name);
  if (revisionName !== requireString('expectedRevisionName', expectedRevisionName)) {
    throw new Error(`revision identity mismatch: expected ${expectedRevisionName}, got ${revisionName}`);
  }
  const revisionUid = requireString('revision.metadata.uid', revision.metadata?.uid);
  const labels = revision.metadata?.labels;
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
    throw new Error('revision labels drifted');
  }
  const sourceRevision = requireExactSha('expectedSourceRevision', expectedSourceRevision);
  if (labels['prooffleet-source-sha'] !== sourceRevision) {
    throw new Error('candidate revision source label mismatch');
  }
  if (String(labels['prooffleet-candidate']) !== 'true') {
    throw new Error('candidate revision marker label missing');
  }

  const runtimeServiceAccount = requireString(
    'revision.spec.serviceAccountName',
    revision.spec?.serviceAccountName,
  );
  if (runtimeServiceAccount !== requireString(
    'expectedRuntimeServiceAccount',
    expectedRuntimeServiceAccount,
  )) {
    throw new Error('runtime service account changed');
  }

  const container = revision.spec?.containers?.[0];
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    throw new Error('revision container shape drifted');
  }
  const image = requireString('revision runtime image', container.image);
  if (image !== requireString('expectedRuntimeImage', expectedRuntimeImage)) {
    throw new Error('revision image is not the registry-proven runtime manifest');
  }
  const env = Array.isArray(container.env) ? container.env : [];
  const declaredSource = env.find((entry) => entry?.name === 'PROOFFLEET_SOURCE_REVISION')?.value;
  if (declaredSource !== sourceRevision) throw new Error('candidate declared source mismatch');

  const ready = Array.isArray(revision.status?.conditions)
    && revision.status.conditions.some(
      (condition) => condition?.type === 'Ready' && String(condition?.status).toLowerCase() === 'true',
    );
  if (!ready) throw new Error('candidate revision is not provider-Ready');

  return {
    revisionName,
    revisionUid,
    runtimeServiceAccount,
    runtimeImage: image,
    environmentNames: env.map((entry) => entry?.name).filter(Boolean),
    responseSha256: sha256Hex(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')),
  };
}

export function parseCandidateServiceTrafficReadback(raw, {
  expectedRevisionName,
  candidateTag,
}) {
  const service = parseJsonObject('Cloud Run service traffic readback', raw);
  const serviceUid = requireString('service.metadata.uid', service.metadata?.uid);
  const traffic = service.status?.traffic;
  if (!Array.isArray(traffic)) throw new Error('Cloud Run service traffic shape drifted');

  const revisionName = requireString('expectedRevisionName', expectedRevisionName);
  const tag = requireString('candidateTag', candidateTag);
  const candidateTraffic = traffic.filter((entry) => entry?.revisionName === revisionName);
  const percent = candidateTraffic.reduce((sum, entry) => sum + Number(entry?.percent || 0), 0);
  if (percent !== 0) throw new Error(`candidate revision unexpectedly receives ${percent}% normal traffic`);
  const taggedTarget = candidateTraffic.find((entry) => entry?.tag === tag);
  const candidateUrl = requireString('candidate tag url', taggedTarget?.url);
  if (!/^https:\/\//.test(candidateUrl)) throw new Error('candidate tag URL is malformed');

  return {
    serviceUid,
    trafficPercent: percent,
    candidateUrl,
    responseSha256: sha256Hex(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8')),
  };
}

export function sealReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('receipt must be an object');
  }
  const body = { ...receipt };
  delete body.receiptHash;
  return {
    ...body,
    receiptHash: sha256Hex(canonicalJson(body)),
  };
}

export function buildArtifactBinding({
  executionIdentity,
  receiptHash,
  artifactName,
  artifactId,
  artifactDigest,
}) {
  if (executionIdentity?.schemaVersion !== 'prooffleet.github-execution-identity.v1') {
    throw new Error('execution identity schema is missing or unsupported');
  }
  const body = {
    schemaVersion: 'prooffleet.github-artifact-binding.v1',
    sourceRevision: requireExactSha('executionIdentity.sourceRevision', executionIdentity.sourceRevision),
    githubExecutionIdentityHash: requireSha256Hex(
      'executionIdentity.identityHash',
      executionIdentity.identityHash,
    ),
    githubRepositoryId: requireNumericId('executionIdentity.repositoryId', executionIdentity.repositoryId),
    githubRunId: requireNumericId('executionIdentity.runId', executionIdentity.runId),
    githubRunAttempt: requireNumericId('executionIdentity.runAttempt', executionIdentity.runAttempt),
    receiptHash: requireSha256Hex('receiptHash', receiptHash),
    artifactName: requireString('artifactName', artifactName),
    artifactId: requireNumericId('artifactId', artifactId),
    artifactDigest: requireSha256Digest('artifactDigest', artifactDigest),
  };
  return {
    ...body,
    bindingHash: sha256Hex(canonicalJson(body)),
  };
}
