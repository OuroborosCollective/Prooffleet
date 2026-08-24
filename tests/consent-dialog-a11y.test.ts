import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { escapeAction, nextDialogFocusIndex } from '../src/components/consentDialogFocus';

const here = dirname(fileURLToPath(import.meta.url));
const modalSource = readFileSync(join(here, '../src/components/ConsentGateModal.tsx'), 'utf8');

describe('Consent dialog accessibility policy', () => {
  it('wraps focus forward and backward deterministically', () => {
    expect(nextDialogFocusIndex(0, 3, false)).toBe(1);
    expect(nextDialogFocusIndex(2, 3, false)).toBe(0);
    expect(nextDialogFocusIndex(0, 3, true)).toBe(2);
    expect(nextDialogFocusIndex(1, 3, true)).toBe(0);
    expect(nextDialogFocusIndex(-1, 3, false)).toBe(0);
    expect(nextDialogFocusIndex(-1, 3, true)).toBe(2);
    expect(nextDialogFocusIndex(0, 0, false)).toBe(-1);
  });

  it('maps Escape to safe Reject only for an authenticated non-submitting operator', () => {
    expect(escapeAction(true, true, false)).toBe('REJECT');
    expect(escapeAction(false, true, false)).toBe('KEEP_OPEN');
    expect(escapeAction(true, false, false)).toBe('KEEP_OPEN');
    expect(escapeAction(true, true, true)).toBe('KEEP_OPEN');
  });

  it('keeps required alertdialog semantics and least-destructive focus wiring in the component', () => {
    expect(modalSource).toContain('role="alertdialog"');
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).toContain('aria-labelledby="consent-gate-title"');
    expect(modalSource).toContain('aria-describedby="consent-gate-description"');
    expect(modalSource).toContain('ref={rejectRef}');
    expect(modalSource).toContain('onKeyDown={handleDialogKeyDown}');
    expect(modalSource).toContain('Operator rejected execution with Escape key.');
  });
});
