export function nextDialogFocusIndex(
  currentIndex: number,
  focusableCount: number,
  shiftKey: boolean,
): number {
  if (focusableCount <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= focusableCount) {
    return shiftKey ? focusableCount - 1 : 0;
  }
  if (shiftKey) {
    return currentIndex === 0 ? focusableCount - 1 : currentIndex - 1;
  }
  return currentIndex === focusableCount - 1 ? 0 : currentIndex + 1;
}

export function escapeAction(
  operatorConfigured: boolean,
  operatorAuthenticated: boolean,
  isSubmitting: boolean,
): 'REJECT' | 'KEEP_OPEN' {
  return operatorConfigured && operatorAuthenticated && !isSubmitting
    ? 'REJECT'
    : 'KEEP_OPEN';
}
