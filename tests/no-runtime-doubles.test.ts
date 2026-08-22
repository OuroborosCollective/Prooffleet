/**
 * tests/no-runtime-doubles.test.ts — statischer Guard (SPEC Grundprinzipien):
 * - keine Mock/Fake-Double-Importe im Runtime-Pfad (server/, server.ts)
 * - kein Auto-Approve-Muster mehr im Runtime-Code
 * - keine erfundenen Score-Konstanten im Runtime-Code
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectRuntimeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectRuntimeFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const runtimeFiles = [
  ...collectRuntimeFiles(path.join(repoRoot, 'server')),
  path.join(repoRoot, 'server.ts'),
];

describe('no-runtime-doubles guard', () => {
  it('found runtime source files to check', () => {
    // Assert (Arrange/Act trivial: Dateisystem-Listing)
    expect(runtimeFiles.length).toBeGreaterThan(10);
  });

  it('runtime code imports no mocks/fakes/test-doubles', () => {
    // Arrange
    const offenders: string[] = [];

    // Act
    for (const file of runtimeFiles) {
      const source = readFileSync(file, 'utf8');
      const importLines = source.match(/^import .*$/gm) ?? [];
      for (const line of importLines) {
        if (/\b(mock|fake|stub|dummy|fixture)s?\b/i.test(line) && !/^(import\s+type)/.test('')) {
          offenders.push(`${path.relative(repoRoot, file)}: ${line}`);
        }
      }
    }

    // Assert
    expect(offenders).toEqual([]);
  });

  it('runtime code contains no auto-approve patterns', () => {
    // Arrange
    const offenders: string[] = [];

    // Act
    for (const file of runtimeFiles) {
      const source = readFileSync(file, 'utf8');
      if (source.includes('Auto-Validated')) offenders.push(`${file}: 'Auto-Validated'`);
      if (/setTimeout[\s\S]{0,200}APPROVED/.test(source)) {
        offenders.push(`${file}: setTimeout..APPROVED`);
      }
      if (/\brespond\([^)]*APPROVED[^)]*\)/.test(source) && !file.includes('fleetRunner')) {
        // respond() mit APPROVED darf nur ueber den echten API-Pfad kommen.
        offenders.push(`${file}: direct respond(APPROVED)`);
      }
    }

    // Assert
    expect(offenders).toEqual([]);
  });

  it('runtime code contains no hardcoded truth/consensus scores', () => {
    // Arrange
    const offenders: string[] = [];
    const banned = ['overallTruthScore', 'overallConsensusScore', 'truthScore'];

    // Act
    for (const file of runtimeFiles) {
      const source = readFileSync(file, 'utf8');
      for (const token of banned) {
        if (source.includes(token)) offenders.push(`${path.relative(repoRoot, file)}: ${token}`);
      }
    }

    // Assert
    expect(offenders).toEqual([]);
  });
});
