import { describe, expect, it } from 'vitest';

import { resolveRuntimePort } from '../server/runtimePort';

describe('Cloud Run runtime PORT contract', () => {
  it('defaults to 3000 outside managed runtimes', () => {
    expect(resolveRuntimePort(undefined)).toBe(3000);
    expect(resolveRuntimePort('')).toBe(3000);
  });

  it('honors an injected managed-runtime port', () => {
    expect(resolveRuntimePort('8080')).toBe(8080);
    expect(resolveRuntimePort('3187')).toBe(3187);
  });

  it('fails closed on malformed or out-of-range ports', () => {
    expect(() => resolveRuntimePort('abc')).toThrow(/decimal digits/);
    expect(() => resolveRuntimePort('0')).toThrow(/between 1 and 65535/);
    expect(() => resolveRuntimePort('65536')).toThrow(/between 1 and 65535/);
    expect(() => resolveRuntimePort('3000.5')).toThrow(/decimal digits/);
  });
});
