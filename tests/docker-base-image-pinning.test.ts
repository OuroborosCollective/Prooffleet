import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(join(here, '../Dockerfile'), 'utf8');
const NODE_22_BOOKWORM_SLIM = 'node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436';

describe('Docker base-image pinning', () => {
  it('uses one reviewed immutable Node base digest for both build and runtime stages', () => {
    expect(dockerfile).toContain('FROM ' + NODE_22_BOOKWORM_SLIM + ' AS build');
    expect(dockerfile).toContain('FROM ' + NODE_22_BOOKWORM_SLIM + ' AS runtime');
    expect(dockerfile).not.toContain('FROM node:22-bookworm-slim AS');
  });

  it('rejects a mutable Node tag even when the remaining Docker build contract is unchanged', () => {
    const mutable = dockerfile.replaceAll('@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436', '');
    expect(mutable).toContain('FROM node:22-bookworm-slim AS build');
    expect(mutable).not.toContain('FROM ' + NODE_22_BOOKWORM_SLIM + ' AS build');
  });
});
