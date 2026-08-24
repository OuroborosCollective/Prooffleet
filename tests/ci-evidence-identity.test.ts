import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/ci.yml'), 'utf8');
const UPLOAD_ARTIFACT_PIN = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';

describe('CI evidence identity workflow contract', () => {
  it('binds runtime artifact and readback bytes before writing the receipt', () => {
    expect(workflow).toContain("docker image inspect --format '{{.Id}}'");
    expect(workflow).toContain("'^sha256:[0-9a-f]{64}$'");
    expect(workflow).toContain('sha256sum /tmp/prooffleet-container-health.json');
    expect(workflow).toContain('CI_CONTAINER_IMAGE_ID');
    expect(workflow).toContain('CI_HEALTH_READBACK_SHA256');
  });

  it('uploads the receipt as a run-and-attempt-scoped artifact using the reviewed action pin', () => {
    expect(workflow).toContain(UPLOAD_ARTIFACT_PIN);
    expect(workflow).not.toMatch(/actions\/upload-artifact@v\d+\b/);
    expect(workflow).toContain('prooffleet-ci-revision-receipt-${{ github.run_id }}-${{ github.run_attempt }}');
    expect(workflow).toContain('ci-revision-receipt.json');
  });

  it('requires the v2 receipt identity hash before upload', () => {
    expect(workflow).toContain("r.schemaVersion!=='prooffleet.ci-revision-receipt.v2'");
    expect(workflow).toContain('r.evidenceIdentitySha256');
  });
});
