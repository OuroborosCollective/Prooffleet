import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const SERVICE_ACCOUNT = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/;
const WIF_PROVIDER = /^projects\/([1-9][0-9]*)\/locations\/global\/workloadIdentityPools\/([A-Za-z0-9._-]+)\/providers\/([A-Za-z0-9._-]+)$/;

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function asObject(label, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
  return value;
}

function exactKeys(label, value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(label + ' shape drifted');
  }
}

function required(label, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /[\r\n\0]/.test(normalized)) throw new Error(label + ' is required');
  return normalized;
}

/**
 * Strictly parses secret-free WIF facts. The short-lived bearer header is
 * validated but never emitted or included in the configuration hash.
 */
function credentialEvidence(rawCredentialJson, expectedProvider, expectedServiceAccount) {
  const provider = WIF_PROVIDER.exec(expectedProvider);
  if (!provider) throw new Error('expected WIF provider is malformed');
  if (!SERVICE_ACCOUNT.test(expectedServiceAccount)) throw new Error('expected WIF service account is malformed');
  if (!rawCredentialJson || rawCredentialJson.length > 128000) {
    throw new Error('credential configuration is empty or unexpectedly large');
  }

  let parsed;
  try { parsed = JSON.parse(rawCredentialJson); } catch { throw new Error('credential configuration is not valid JSON'); }
  const top = asObject('credential configuration', parsed);
  exactKeys('credential configuration', top, [
    'audience', 'credential_source', 'service_account_impersonation_url',
    'subject_token_type', 'token_url', 'type',
  ]);
  if (top.type !== 'external_account') throw new Error('credential type is not external_account');

  const audience = '//iam.googleapis.com/' + expectedProvider;
  if (top.audience !== audience) throw new Error('credential audience does not match expected WIF provider');
  if (top.subject_token_type !== 'urn:ietf:params:oauth:token-type:jwt') throw new Error('credential subject token type drifted');
  if (top.token_url !== 'https://sts.googleapis.com/v1/token') throw new Error('credential STS token URL drifted');

  const source = asObject('credential_source', top.credential_source);
  exactKeys('credential_source', source, ['format', 'headers', 'url']);
  if (typeof source.url !== 'string') throw new Error('credential_source.url must be a string');
  let sourceUrl;
  try { sourceUrl = new URL(source.url); } catch { throw new Error('credential source URL is malformed'); }
  if (sourceUrl.protocol !== 'https:' || !sourceUrl.hostname.endsWith('.actions.githubusercontent.com')) {
    throw new Error('credential source is not a GitHub Actions HTTPS identity endpoint');
  }

  const headers = asObject('credential_source.headers', source.headers);
  exactKeys('credential_source.headers', headers, ['Authorization']);
  if (typeof headers.Authorization !== 'string' || !/^Bearer [^\s]+$/.test(headers.Authorization)) {
    throw new Error('credential source authorization header is missing or malformed');
  }

  const format = asObject('credential_source.format', source.format);
  exactKeys('credential_source.format', format, ['subject_token_field_name', 'type']);
  if (format.type !== 'json' || format.subject_token_field_name !== 'value') throw new Error('credential source token format drifted');

  if (typeof top.service_account_impersonation_url !== 'string') throw new Error('service account impersonation URL is missing');
  let impersonationUrl;
  try { impersonationUrl = new URL(top.service_account_impersonation_url); } catch { throw new Error('service account impersonation URL is malformed'); }
  if (impersonationUrl.protocol !== 'https:' || impersonationUrl.hostname !== 'iamcredentials.googleapis.com') {
    throw new Error('credential impersonation endpoint drifted');
  }
  const accountMatch = /^\/v1\/projects\/-\/serviceAccounts\/([^/]+):generateAccessToken$/.exec(impersonationUrl.pathname);
  const observedServiceAccount = accountMatch ? decodeURIComponent(accountMatch[1]) : '';
  if (observedServiceAccount !== expectedServiceAccount) throw new Error('credential impersonation target does not match expected service account');

  const secretFreeConfiguration = {
    configShapeVersion: 'google-github-actions-auth-external-account.v1',
    credentialType: 'external_account',
    wifProvider: expectedProvider,
    wifProviderProjectNumber: provider[1],
    serviceAccount: expectedServiceAccount,
    audience,
    subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    tokenUrl: 'https://sts.googleapis.com/v1/token',
    credentialSourceHost: sourceUrl.hostname,
    credentialSourceOrigin: sourceUrl.origin,
    credentialSourcePath: sourceUrl.pathname,
    credentialSourceQueryKeys: [...sourceUrl.searchParams.keys()].sort(),
    authorizationScheme: 'Bearer',
    tokenFormat: { type: 'json', subjectTokenFieldName: 'value' },
    impersonationOrigin: impersonationUrl.origin,
    impersonationPath: impersonationUrl.pathname,
  };
  return {
    projectNumber: provider[1],
    credentialConfigSha256: sha256(canonicalJson(secretFreeConfiguration)),
  };
}

export function verifyWifIdentity(input) {
  const expectedProvider = required('expected WIF provider', input.expectedProvider);
  const expectedServiceAccount = required('expected WIF service account', input.expectedServiceAccount);
  const expectedProjectId = required('expected GCP project ID', input.expectedProjectId);
  const observedPrincipal = required('observed Google principal', input.observedPrincipal);
  const observedProjectId = required('observed Google project ID', input.observedProjectId);
  const observedProjectNumber = required('observed Google project number', input.observedProjectNumber);
  const credential = credentialEvidence(input.rawCredentialJson, expectedProvider, expectedServiceAccount);
  if (observedPrincipal !== expectedServiceAccount) throw new Error('observed Google principal does not match expected WIF service account');
  if (observedProjectId !== expectedProjectId) throw new Error('observed Google project ID does not match expected project');
  if (!POSITIVE_DECIMAL.test(observedProjectNumber) || observedProjectNumber !== credential.projectNumber) {
    throw new Error('observed Google project number does not match expected WIF provider project');
  }
  return {
    principal: observedPrincipal,
    principalSha256: sha256(observedPrincipal),
    projectId: observedProjectId,
    projectNumber: observedProjectNumber,
    credentialConfigSha256: credential.credentialConfigSha256,
  };
}

function runCli() {
  const [credentialPath, expectedProvider, expectedServiceAccount, observedPrincipal, observedProjectId, observedProjectNumber, expectedProjectId, outputPath] = process.argv.slice(2);
  if (!credentialPath || !outputPath) {
    throw new Error('usage: verify-wif-identity.mjs <credential-path> <provider> <service-account> <principal> <project-id> <project-number> <expected-project-id> <github-output>');
  }
  const verified = verifyWifIdentity({
    rawCredentialJson: readFileSync(credentialPath, 'utf8'),
    expectedProvider, expectedServiceAccount, observedPrincipal, observedProjectId, observedProjectNumber, expectedProjectId,
  });
  for (const [key, value] of Object.entries(verified)) {
    appendFileSync(outputPath, key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase()) + '=' + value + '\n');
  }
  process.stdout.write('[wif-identity] actual principal, project number and secret-free credential configuration matched expected federation\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCli(); } catch (error) {
    process.stderr.write(`WIF identity verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
