import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ADK canary receipt must be an object');
  }
  return value;
}

/**
 * This verifies upload-time self-integrity and the scoped observed claim. It
 * intentionally does not elevate a receipt to canonical truth: only provider
 * readback and the receipt's source-bound workflow may do that.
 */
export function verifyAdkCanaryReceipt(value, expectedSourceRevision) {
  const receipt = requireObject(value);
  if (!SHA40.test(String(expectedSourceRevision || ''))) {
    throw new Error('expected ADK source revision must be an exact lowercase 40-character Git SHA');
  }

  const { receiptHash, ...body } = receipt;
  if (body.schemaVersion !== 'prooffleet.adk-wif-canary.v1') {
    throw new Error('ADK canary receipt schema is not recognized');
  }
  if (body.outcome !== 'OBSERVED') {
    throw new Error('ADK canary receipt outcome is not OBSERVED');
  }
  if (body.sourceRevision !== expectedSourceRevision) {
    throw new Error('ADK canary receipt source revision does not match the approved source');
  }
  if (!SHA256.test(String(receiptHash || ''))) {
    throw new Error('ADK canary receipt hash is malformed');
  }

  const recomputed = sha256Json(body);
  if (receiptHash !== recomputed) {
    throw new Error('ADK canary receipt hash does not match its contents');
  }

  return {
    sourceRevision: body.sourceRevision,
    receiptHash,
  };
}

function runCli() {
  const [receiptPath, expectedSourceRevision] = process.argv.slice(2);
  if (!receiptPath || !expectedSourceRevision) {
    throw new Error('usage: verify-adk-canary-receipt.mjs <receipt-path> <expected-source-revision>');
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const verified = verifyAdkCanaryReceipt(receipt, expectedSourceRevision);
  process.stdout.write(
    `[adk-receipt] source=${verified.sourceRevision} hash=${verified.receiptHash} verified before artifact upload\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ADK canary receipt verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
