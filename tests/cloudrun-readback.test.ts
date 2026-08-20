import { describe, expect, it } from 'vitest';

import { projectCloudRunReadback } from '../server/adapters/gcp/cloudrun';

const REV_A = 'a'.repeat(40);
const REV_B = 'b'.repeat(40);

describe('Cloud Run deployment readback projection', () => {
  it('projects authoritative service identity and matching declared source revision', () => {
    const requestedName = 'projects/p1/locations/europe-west1/services/prooffleet';
    const result = projectCloudRunReadback(
      requestedName,
      {
        name: requestedName,
        uri: 'https://prooffleet-example.run.app',
        reconciling: false,
        latestReadyRevision: 'prooffleet-00042-abc',
        latestCreatedRevision: 'prooffleet-00042-abc',
        observedGeneration: '17',
        template: {
          containers: [
            {
              env: [
                { name: 'UNRELATED', value: 'ignored' },
                { name: 'PROOFFLEET_SOURCE_REVISION', value: REV_A },
              ],
            },
          ],
        },
      },
      REV_A,
    );

    expect(result.ok).toBe(true);
    expect(result.evidence).toEqual({
      sourceKind: 'CLOUD_RUN_READBACK',
      serviceName: requestedName,
      uri: 'https://prooffleet-example.run.app',
      reconciling: false,
      latestReadyRevision: 'prooffleet-00042-abc',
      latestCreatedRevision: 'prooffleet-00042-abc',
      observedGeneration: '17',
      declaredSourceRevision: REV_A,
      sourceRevisionMatchesExpected: true,
    });
  });

  it('reports revision mismatch instead of accepting an old deployment', () => {
    const requestedName = 'projects/p1/locations/europe-west1/services/prooffleet';
    const result = projectCloudRunReadback(
      requestedName,
      {
        template: {
          containers: [
            { env: [{ name: 'PROOFFLEET_SOURCE_REVISION', value: REV_A }] },
          ],
        },
      },
      REV_B,
    );

    expect(result.evidence?.declaredSourceRevision).toBe(REV_A);
    expect(result.evidence?.sourceRevisionMatchesExpected).toBe(false);
  });

  it('preserves unknown provider fields as null instead of fabricating values', () => {
    const requestedName = 'projects/p1/locations/europe-west1/services/prooffleet';
    const result = projectCloudRunReadback(requestedName, {});

    expect(result.ok).toBe(true);
    expect(result.evidence).toEqual({
      sourceKind: 'CLOUD_RUN_READBACK',
      serviceName: requestedName,
      uri: null,
      reconciling: null,
      latestReadyRevision: null,
      latestCreatedRevision: null,
      observedGeneration: null,
      declaredSourceRevision: null,
      sourceRevisionMatchesExpected: null,
    });
  });
});
