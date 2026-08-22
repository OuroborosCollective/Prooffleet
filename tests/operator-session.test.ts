import { describe, expect, it } from 'vitest';

import {
  OPERATOR_SESSION_COOKIE,
  OperatorSessionManager,
} from '../server/security/operatorSession';

describe('OperatorSessionManager', () => {
  it('fails closed when operator authentication is not provisioned', () => {
    const manager = new OperatorSessionManager({});
    const result = manager.createSession('anything');

    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.status).toBe(503);
    expect(manager.authenticate(undefined).authenticated).toBe(false);
  });

  it('rejects invalid credentials without issuing a session', () => {
    const manager = new OperatorSessionManager({
      PROOFFLEET_OPERATOR_TOKEN: 'correct-token',
      PROOFFLEET_SESSION_SECRET: 'session-secret',
    });

    const result = manager.createSession('wrong-token');
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.status).toBe(401);
  });

  it('issues a short-lived HttpOnly session and derives identity server-side', () => {
    let now = 1_000_000;
    const manager = new OperatorSessionManager(
      {
        PROOFFLEET_OPERATOR_TOKEN: 'correct-token',
        PROOFFLEET_SESSION_SECRET: 'session-secret',
        PROOFFLEET_OPERATOR_IDENTITY: 'owner',
        NODE_ENV: 'production',
      },
      { now: () => now, ttlSeconds: 60 },
    );

    const result = manager.createSession('correct-token');
    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error('expected authenticated session');
    expect(result.identity).toBe('owner');
    expect(result.setCookie).toContain(`${OPERATOR_SESSION_COOKIE}=`);
    expect(result.setCookie).toContain('HttpOnly');
    expect(result.setCookie).toContain('SameSite=Strict');
    expect(result.setCookie).toContain('Secure');

    const cookie = result.setCookie.split(';')[0];
    const authenticated = manager.authenticate(cookie);
    expect(authenticated.authenticated).toBe(true);
    expect(authenticated.identity).toBe('owner');

    now += 61_000;
    const expired = manager.authenticate(cookie);
    expect(expired.authenticated).toBe(false);
    expect(expired.reason).toBe('session_expired');
  });

  it('rejects a tampered session cookie', () => {
    const manager = new OperatorSessionManager({
      PROOFFLEET_OPERATOR_TOKEN: 'correct-token',
      PROOFFLEET_SESSION_SECRET: 'session-secret',
    });
    const result = manager.createSession('correct-token');
    if (result.ok === false) throw new Error('expected authenticated session');
    const cookie = result.setCookie.split(';')[0];
    const [name, value] = cookie.split('=', 2);
    const tampered = `${name}=${value.slice(0, -1)}x`;

    expect(manager.authenticate(tampered).authenticated).toBe(false);
  });
});
