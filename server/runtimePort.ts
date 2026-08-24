const DEFAULT_PORT = 3000;

export function resolveRuntimePort(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_PORT;
  if (typeof value !== 'string') {
    throw new Error('PORT must be a decimal string');
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('PORT must contain only decimal digits');
  }

  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}
