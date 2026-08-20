import { describe, expect, it } from 'vitest';

import { projectCloudRunReadback } from '../server/adapters/gcp/cloudrun';

describe('Cloud Run deployment readback projection', () => {
  it('projects authoritative service identity without inventing deployment fields', () => {
    const requestedName = 'projects/p1/locations/europe-west1/services/prooffleet';
    const result = projectCloudRunReadback(requestedName, {
      name: requestedName,
      uri: 'https://prooffleet-example.run.app',
      reconciling: false,
      latestReadyRevision: 'prooffleet-00042-abc',
      latestCreatedRevision: 'prooffleet-00042-abc',
      observedGeneration: '17',
    });

    expect(result.ok).toBe(true);
    expect(result.evidence).toEqual({
      sourceKind: 'CLOUD_RUN_READBACK',
      serviceName: requestedName,
      uri: 'https://prooffleet-example.run.app',
      reconciling: false,
      latestReadyRevision: 'prooffleet-00042-abc',
      latestCreatedRevision: 'prooffleet-00042-abc',
      observedGeneration: '17',
    });
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
    });
  });
});
