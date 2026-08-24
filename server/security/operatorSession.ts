import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const OPERATOR_SESSION_COOKIE = 'prooffleet_operator_session';
const SESSION_VERSION = 1;
const DEFAULT_TTL_SECONDS = 15 * 60;

export interface OperatorSessionEnvironment {
  PROOFFLEET_OPERATOR_TOKEN?: string;
  PROOFFLEET_SESSION_SECRET?: string;
  PROOFFLEET_OPERATOR_IDENTITY?: string;
  NODE_ENV?: string;
}

export interface OperatorSessionState {
  configured: boolean;
  authenticated: boolean;
  identity: string | null;
  reason?: string;
}

interface SessionPayload {
  v: number;
  identity: string;
  exp: number;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (
      parsed.v !== SESSION_VERSION ||
      typeof parsed.identity !== 'string' ||
      parsed.identity.length < 1 ||
      typeof parsed.exp !== 'number' ||
      !Number.isSafeInteger(parsed.exp)
    ) {
      return null;
    }
    return parsed as SessionPayload;
  } catch {
    return null;
  }
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return part.slice(index + 1).trim();
  }
  return null;
}

export class OperatorSessionManager {
  private readonly operatorToken: string | null;
  private readonly sessionSecret: string | null;
  private readonly identity: string;
  private readonly ttlSeconds: number;
  private readonly now: () => number;
  private readonly secureCookie: boolean;

  constructor(
    env: OperatorSessionEnvironment,
    options: { ttlSeconds?: number; now?: () => number } = {},
  ) {
    this.operatorToken = env.PROOFFLEET_OPERATOR_TOKEN?.trim() || null;
    this.sessionSecret = env.PROOFFLEET_SESSION_SECRET?.trim() || null;
    this.identity = env.PROOFFLEET_OPERATOR_IDENTITY?.trim() || 'operator';
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.now = options.now ?? (() => Date.now());
    this.secureCookie = env.NODE_ENV === 'production';
  }

  get configured(): boolean {
    return this.operatorToken !== null && this.sessionSecret !== null;
  }

  createSession(providedToken: unknown):
    | { ok: true; identity: string; expiresAt: string; setCookie: string }
    | { ok: false; status: 401 | 503; reason: string } {
    if (!this.configured) {
      return { ok: false, status: 503, reason: 'operator authentication is not provisioned' };
    }
    if (typeof providedToken !== 'string' || !safeEqual(providedToken, this.operatorToken!)) {
      return { ok: false, status: 401, reason: 'invalid operator credential' };
    }

    const exp = Math.floor(this.now() / 1000) + this.ttlSeconds;
    const payload = encode({ v: SESSION_VERSION, identity: this.identity, exp });
    const signature = this.sign(payload);
    const value = `${payload}.${signature}`;
    const secure = this.secureCookie ? '; Secure' : '';
    return {
      ok: true,
      identity: this.identity,
      expiresAt: new Date(exp * 1000).toISOString(),
      setCookie: `${OPERATOR_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${this.ttlSeconds}${secure}`,
    };
  }

  authenticate(cookieHeader: string | undefined): OperatorSessionState {
    if (!this.configured) {
      return { configured: false, authenticated: false, identity: null, reason: 'not_provisioned' };
    }
    const raw = parseCookie(cookieHeader, OPERATOR_SESSION_COOKIE);
    if (!raw) {
      return { configured: true, authenticated: false, identity: null, reason: 'session_missing' };
    }
    const separator = raw.lastIndexOf('.');
    if (separator < 1) {
      return { configured: true, authenticated: false, identity: null, reason: 'session_malformed' };
    }
    const payloadText = raw.slice(0, separator);
    const signature = raw.slice(separator + 1);
    const expected = this.sign(payloadText);
    if (!safeEqual(signature, expected)) {
      return { configured: true, authenticated: false, identity: null, reason: 'session_signature_invalid' };
    }
    const payload = decode(payloadText);
    if (!payload) {
      return { configured: true, authenticated: false, identity: null, reason: 'session_payload_invalid' };
    }
    if (this.now() >= payload.exp * 1000) {
      return { configured: true, authenticated: false, identity: null, reason: 'session_expired' };
    }
    return { configured: true, authenticated: true, identity: payload.identity };
  }

  private sign(payload: string): string {
    if (!this.sessionSecret) return '';
    return createHmac('sha256', this.sessionSecret).update(payload, 'utf8').digest('base64url');
  }
}
