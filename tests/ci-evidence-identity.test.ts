import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const workflow = readFileSync(join(here, '../.github/workflows/ci.yml'), 'utf8');
const UPLOAD_ARTIFACT_PIN = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';
const RUNTIME_ARTIFACT_NAME = 'prooffleet-ci-runtime-evidence-' + '$' + '{{ github.run_id }}-' + '$' + '{{ github.run_attempt }}';
const BINDING_ARTIFACT_NAME = 'prooffleet-ci-artifact-binding-' + '$' + '{{ github.run_id }}-' + '$' + '{{ github.run_attempt }}';

describe('CI evidence identity workflow contract', () => {
  it('binds started-container identity and runtime health bytes before writing the receipt', () => {
    expect(workflow).toContain("docker image inspect --format '{{.Id}}'");
    expect(workflow).toContain("docker inspect --format '{{.Id}}' \"$NAME\"");
    expect(workflow).toContain("docker inspect --format '{{.Image}}' \"$NAME\"");
    expect(workflow).toContain("docker inspect --format '{{.State.Running}}' \"$NAME\"");
    expect(workflow).toContain('CI_CONTAINER_ID');
    expect(workflow).toContain('CI_CONTAINER_RUNNING');
    expect(workflow).toContain('CI_CONTAINER_IMAGE_ID');
    expect(workflow).toContain('sha256sum ci-runtime-health.json');
    expect(workflow).toContain('CI_HEALTH_READBACK_SHA256');
  });

  it('uploads raw runtime evidence before binding the returned GitHub artifact ID and digest', () => {
    expect(workflow).toContain(UPLOAD_ARTIFACT_PIN);
    expect(workflow).not.toMatch(/actions\/upload-artifact@v\d+\b/);
    expect(workflow).toContain('id: upload_runtime_evidence');
    expect(workflow).toContain(RUNTIME_ARTIFACT_NAME);
    expect(workflow).toContain('ci-revision-receipt.json');
    expect(workflow).toContain('ci-runtime-health.json');
    expect(workflow).toContain('steps.upload_runtime_evidence.outputs.artifact-id');
    expect(workflow).toContain('steps.upload_runtime_evidence.outputs.artifact-digest');
    expect(workflow).toContain('node scripts/ci-artifact-binding.mjs');
    expect(workflow).toContain(BINDING_ARTIFACT_NAME);
    expect(workflow.indexOf('id: upload_runtime_evidence')).toBeLessThan(workflow.indexOf('node scripts/ci-artifact-binding.mjs'));
  });

  it('requires the v3 receipt and artifact-binding hash before upload', () => {
    expect(workflow).toContain("r.schemaVersion!=='prooffleet.ci-revision-receipt.v3'");
    expect(workflow).toContain('r.runtime?.containerRunning!==true');
    expect(workflow).toContain('r.evidenceIdentitySha256');
    expect(workflow).toContain("b.schemaVersion!=='prooffleet.ci-artifact-binding.v1'");
    expect(workflow).toContain('b.bindingSha256');
  });
});
