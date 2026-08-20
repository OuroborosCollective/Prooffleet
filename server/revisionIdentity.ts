const EXACT_GIT_SHA = /^[0-9a-f]{40}$/;

export function normalizeExactGitRevision(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return EXACT_GIT_SHA.test(normalized) ? normalized : null;
}

export function requireExactGitRevision(value: unknown): string {
  const revision = normalizeExactGitRevision(value);
  if (!revision) {
    throw new Error('exact lowercase 40-character Git source revision required');
  }
  return revision;
}
