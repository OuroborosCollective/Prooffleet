import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/ci.yml'), 'utf8');

describe('CI evidence identity workflow contract', () => {
  it('binds runtime artifact and readback bytes before writing the receipt', () => {
    expect(workflow).toContain("docker image inspect --format '{{.Id}}'");
    expect(workflow).toContain("'^sha256:[0-9a-f]{64}$'");
    expect(workflow).toContain('sha256sum /tmp/prooffleet-container-health.json');
    expect(workflow).toContain('CI_CONTAINER_IMAGE_ID');
    expect(workflow).toContain('CI_HEALTH_READBACK_SHA256');
  });

  it('uploads the receipt as a run-and-attempt-scoped artifact', () => {
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('prooffleet-ci-revision-receipt-${{ github.run_id }}-${{ github.run_attempt }}');
    expect(workflow).toContain('ci-revision-receipt.json');
  });

  it('requires the v2 receipt identity hash before upload', () => {
    expect(workflow).toContain("r.schemaVersion!=='prooffleet.ci-revision-receipt.v2'");
    expect(workflow).toContain('r.evidenceIdentitySha256');
  });
});
