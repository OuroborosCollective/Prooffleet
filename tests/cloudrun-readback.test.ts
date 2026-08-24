import { describe, expect, it } from 'vitest';
import { projectCloudRunReadback } from '../server/adapters/gcp/cloudrun';

const REV_A = 'a'.repeat(40);
const REV_B = 'b'.repeat(40);
const NAME = 'projects/p1/locations/europe-west1/services/prooffleet';

function service(source = REV_A) {
  return {
    name: NAME,
    uri: 'https://prooffleet-example.run.app',
    reconciling: false,
    latestReadyRevision: 'prooffleet-00042-abc',
    latestCreatedRevision: 'prooffleet-00042-abc',
    observedGeneration: '17',
    template: { containers: [{ env: [{ name: 'UNRELATED', value: 'ignored' }, { name: 'PROOFFLEET_SOURCE_REVISION', value: source }] }] },
  };
}

describe('Cloud Run readback parser contract v2', () => {
  it('accepts exact provider service identity and matching source revision', () => {
    const result = projectCloudRunReadback(NAME, service(), REV_A);
    expect(result.ok).toBe(true);
    expect(result.evidence).toMatchObject({
      sourceKind: 'CLOUD_RUN_READBACK', parserContract: 'prooffleet.cloudrun-readback.v2',
      serviceName: NAME, declaredSourceRevision: REV_A, sourceRevisionMatchesExpected: true,
    });
  });

  it('reports a valid but old source revision as a mismatch', () => {
    const result = projectCloudRunReadback(NAME, service(REV_A), REV_B);
    expect(result.ok).toBe(true);
    expect(result.evidence?.sourceRevisionMatchesExpected).toBe(false);
  });

  it('fails closed when provider identity is missing instead of substituting the requested name', () => {
    const result = projectCloudRunReadback(NAME, { template: { containers: [] } }, REV_A);
    expect(result.ok).toBe(false);
    expect(result.evidence).toBeUndefined();
    expect(result.detail).toMatch(/identity mismatch/);
  });

  it('fails closed on a different provider service identity', () => {
    const result = projectCloudRunReadback(NAME, { ...service(), name: `${NAME}-other` }, REV_A);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/identity mismatch/);
  });

  it('fails closed on duplicate source declarations instead of choosing one', () => {
    const value = service();
    value.template.containers.push({ env: [{ name: 'PROOFFLEET_SOURCE_REVISION', value: REV_A }] });
    const result = projectCloudRunReadback(NAME, value, REV_A);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/ambiguous/);
  });

  it('fails closed on malformed source values and parser-shape drift', () => {
    expect(projectCloudRunReadback(NAME, service('main'), REV_A).ok).toBe(false);
    const drifted = { ...service(), template: { containers: { unexpected: true } } } as never;
    const result = projectCloudRunReadback(NAME, drifted, REV_A);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/parser contract drifted/);
  });

  it('fails closed on malformed expected source identity', () => {
    const result = projectCloudRunReadback(NAME, service(), 'main');
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/expected source revision is malformed/);
  });
});
