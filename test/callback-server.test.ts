import { describe, expect, it } from 'vitest';
import { startCallbackServer } from '../src/core/sso.js';

const pendingTimers = () =>
  process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length;

describe('sso callback server', () => {
  it('returns the authorization code the browser redirects with', async () => {
    const server = await startCallbackServer('st4te');
    const waiting = server.waitForCode(10_000);

    const response = await fetch(`${server.redirectUri}?code=abc123&state=st4te`);
    await response.text();

    expect(response.status).toBe(200);
    await expect(waiting).resolves.toBe('abc123');
    server.close();
  });

  // The 0.3.2 regression: the sign-in succeeded but the losing setTimeout of the
  // Promise.race stayed pending, so the process sat there for the full timeout.
  it('leaves no pending timer behind once the code arrives', async () => {
    const before = pendingTimers();
    const server = await startCallbackServer('st4te');
    const waiting = server.waitForCode(120_000);

    await (await fetch(`${server.redirectUri}?code=abc123&state=st4te`)).text();
    await waiting;
    server.close();

    expect(pendingTimers()).toBe(before);
  });

  it('rejects a mismatched state instead of accepting the code', async () => {
    const server = await startCallbackServer('expected');
    // Assert before triggering, so the rejection always has a handler attached.
    const rejects = expect(server.waitForCode(10_000)).rejects.toThrow(/State mismatch/);

    const response = await fetch(`${server.redirectUri}?code=abc123&state=forged`);
    await response.text();

    expect(response.status).toBe(400);
    await rejects;
    server.close();
  });

  it('surfaces an error returned by the identity provider', async () => {
    const server = await startCallbackServer('st4te');
    const rejects = expect(server.waitForCode(10_000)).rejects.toThrow(/access_denied/);

    await (await fetch(`${server.redirectUri}?error=access_denied`)).text();

    await rejects;
    server.close();
  });
});
