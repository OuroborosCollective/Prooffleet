/**
 * tests/adapters.test.ts — GCP-Adapter melden ohne Konfiguration ehrlich
 * NOT_PROVISIONED und readback ok:false (SPEC §5/§7). Keine Simulation:
 * ohne Env darf kein Adapter jemals ok:true oder PROVISIONED_VERIFIED liefern.
 */
import { describe, it, expect } from 'vitest';

import { createGcpAdapters } from '../server/adapters/gcp/index';

const EMPTY_ENV: NodeJS.ProcessEnv = {};

describe('GCP adapters (unprovisioned environment)', () => {
  it('creates exactly the seven SPEC services', () => {
    // Arrange / Act
    const adapters = createGcpAdapters(EMPTY_ENV);

    // Assert
    expect(adapters.map((a) => a.service).sort()).toEqual(
      ['adk', 'cloudrun', 'firestore', 'modelarmor', 'otel', 'pubsub', 'secretmanager'].sort()
    );
  });

  it('every adapter reports NOT_PROVISIONED without env configuration', async () => {
    // Arrange
    const adapters = createGcpAdapters(EMPTY_ENV);

    // Act
    const statuses = await Promise.all(adapters.map((a) => a.status()));

    // Assert
    for (const [i, s] of statuses.entries()) {
      expect(s.status, `adapter ${adapters[i].service}`).toBe('NOT_PROVISIONED');
      expect(typeof s.detail).toBe('string');
      expect(s.detail.length).toBeGreaterThan(0);
    }
  });

  it('every readback returns ok:false without a real GCP call', async () => {
    // Arrange
    const adapters = createGcpAdapters(EMPTY_ENV);

    // Act
    const readbacks = await Promise.all(adapters.map((a) => a.readback()));

    // Assert
    for (const [i, r] of readbacks.entries()) {
      expect(r.ok, `adapter ${adapters[i].service}`).toBe(false);
      expect(r.detail).toMatch(/no real readback|not provisioned|not configured|disabled/i);
    }
  });

  it('no adapter claims PROVISIONED_VERIFIED or a readback timestamp without env', async () => {
    // Arrange
    const adapters = createGcpAdapters(EMPTY_ENV);

    // Act
    const statuses = await Promise.all(adapters.map((a) => a.status()));

    // Assert
    for (const s of statuses) {
      expect(s.status).not.toBe('PROVISIONED_VERIFIED');
      expect(s.lastReadbackAt).toBeUndefined();
    }
  });

  it('otel adapter stays a no-op when OTEL_ENABLED is not set', async () => {
    // Arrange
    const adapters = createGcpAdapters(EMPTY_ENV);
    const otel = adapters.find((a) => a.service === 'otel');
    if (!otel) throw new Error('otel adapter missing');

    // Act
    const status = await otel.status();
    const readback = await otel.readback();

    // Assert
    expect(status.status).toBe('NOT_PROVISIONED');
    expect(readback.ok).toBe(false);
  });
});
