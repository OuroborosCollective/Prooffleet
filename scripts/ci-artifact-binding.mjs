import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

function requirePositiveInteger(label, value) {
  const normalized = String(value ?? '').trim();
  if (!POSITIVE_INTEGER.test(normalized)) {
    throw new Error(label + ' must be a positive decimal integer');
  }
  return normalized;
}

function requireSha256(label, value) {
  const normalized = String(value ?? '').trim();
  if (!SHA256.test(normalized)) {
    throw new Error(label + ' must be an exact sha256 digest');
  }
  return normalized;
}

function sha256Bytes(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function sha256Text(value) {
  return sha256Bytes(Buffer.from(String(value), 'utf8'));
}

function requireReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('receipt must be an object');
  }
  if (receipt.schemaVersion !== 'prooffleet.ci-revision-receipt.v3') {
    throw new Error('receipt must be a verified CI v3 receipt');
  }
  const runId = requirePositiveInteger('receipt.run.runId', receipt.run?.runId);
  const runAttempt = requirePositiveInteger('receipt.run.runAttempt', receipt.run?.runAttempt);
  const evidenceIdentitySha256 = requireSha256('receipt.evidenceIdentitySha256', receipt.evidenceIdentitySha256);
  const healthReadbackSha256 = requireSha256(
    'receipt.runtime.healthReadbackSha256',
    receipt.runtime?.healthReadbackSha256,
  );
  if (receipt.runtime?.containerRunning !== true) {
    throw new Error('receipt runtime container must be observed running');
  }
  const evidenceIdentity = {
    sourceHeadSha: receipt.sourceHeadSha,
    baseSha: receipt.baseSha,
    testedCheckoutSha: receipt.testedCheckoutSha,
    testedMergeSha: receipt.testedMergeSha,
    run: receipt.run,
    runner: receipt.runner,
    runtime: receipt.runtime,
  };
  if (sha256Text(JSON.stringify(evidenceIdentity)) !== evidenceIdentitySha256) {
    throw new Error('receipt evidence identity hash does not match its contents');
  }
  return { runId, runAttempt, evidenceIdentitySha256, healthReadbackSha256 };
}

/**
 * This receipt deliberately binds the first artifact after GitHub has assigned
 * its immutable artifact ID and archive digest. A second artifact stores this
 * binding; self-referential artifact digest claims are impossible by design.
 */
export function buildArtifactBinding(input) {
  const receipt = requireReceipt(input.receipt);
  const artifactId = requirePositiveInteger('artifactId', input.artifactId);
  const artifactDigest = requireSha256('artifactDigest', input.artifactDigest);
  const artifactName = String(input.artifactName ?? '').trim();
  const expectedName = 'prooffleet-ci-runtime-evidence-' + receipt.runId + '-' + receipt.runAttempt;
  if (artifactName !== expectedName) {
    throw new Error('artifactName must equal ' + expectedName);
  }

  const healthArtifactSha256 = sha256Bytes(input.healthBytes);
  if (healthArtifactSha256 !== receipt.healthReadbackSha256) {
    throw new Error('runtime health artifact bytes do not match the CI receipt');
  }

  const bindingIdentity = {
    receipt: {
      schemaVersion: input.receipt.schemaVersion,
      evidenceIdentitySha256: receipt.evidenceIdentitySha256,
      runId: receipt.runId,
      runAttempt: receipt.runAttempt,
      runtimeHealthReadbackSha256: receipt.healthReadbackSha256,
    },
    runtimeEvidenceArtifact: {
      id: artifactId,
      name: artifactName,
      digest: artifactDigest,
    },
    runtimeHealthArtifactSha256: healthArtifactSha256,
  };

  return {
    schemaVersion: 'prooffleet.ci-artifact-binding.v1',
    ...bindingIdentity,
    bindingSha256: sha256Text(JSON.stringify(bindingIdentity)),
  };
}

function runCli() {
  const receiptPath = process.env.CI_RECEIPT_PATH ?? 'ci-revision-receipt.json';
  const healthPath = process.env.CI_HEALTH_PATH ?? 'ci-runtime-health.json';
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const binding = buildArtifactBinding({
    receipt,
    artifactId: process.env.CI_ARTIFACT_ID,
    artifactDigest: process.env.CI_ARTIFACT_DIGEST,
    artifactName: process.env.CI_ARTIFACT_NAME,
    healthBytes: readFileSync(healthPath),
  });
  process.stdout.write(JSON.stringify(binding, null, 2) + '\n');
}

const invokedAsScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  try { runCli(); }
  catch (error) {
    console.error('[ci-artifact-binding] FAILED: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
