import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { recordSsoSignIn } from './sso-sign-ins.js';
import { sleep } from './util.js';

export interface SsoLoginTarget {
  startUrl: string;
  region: string;
  /** [sso-session X] name when the modern config format is used; null for legacy profiles. */
  sessionName: string | null;
  /** Registration scopes (modern format), e.g. ["sso:account:access"]. */
  scopes: string[];
}

export interface SsoToken {
  accessToken: string;
  expiresAt: Date;
}

/** How the token was obtained — lets the UI explain what happened. */
export type LoginMethod = 'cached' | 'refreshed' | 'browser' | 'device-code';

export interface SsoLoginResult extends SsoToken {
  method: LoginMethod;
}

interface CachedSso {
  startUrl?: string;
  region?: string;
  accessToken?: string;
  expiresAt?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  registrationExpiresAt?: string;
}

/**
 * The SDK and the aws CLI look tokens up in ~/.aws/sso/cache by the SHA-1 of the
 * sso-session NAME (modern format) or of the start URL (legacy format). Writing
 * to the wrong key means the login "succeeds" but nothing ever finds the token.
 */
export function ssoCacheKeySource(target: Pick<SsoLoginTarget, 'sessionName' | 'startUrl'>): string {
  return target.sessionName ?? target.startUrl;
}

export function ssoCachePath(keySource: string): string {
  const key = createHash('sha1').update(keySource).digest('hex');
  return join(homedir(), '.aws', 'sso', 'cache', `${key}.json`);
}

function readCache(keySource: string): CachedSso | null {
  try {
    return JSON.parse(readFileSync(ssoCachePath(keySource), 'utf8')) as CachedSso;
  } catch {
    return null;
  }
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Expiry of a cached SSO token (by session name or start URL), or null when absent/invalid. */
export function readSsoTokenExpiry(keySource: string): Date | null {
  return parseDate(readCache(keySource)?.expiresAt);
}

/**
 * 'refreshable' is a guess: the access token expired, but a refresh token is
 * there — the session may still be alive or may have ended long ago, and only
 * Identity Center knows (see refreshSsoToken). 'unverified' means it was asked
 * and did not answer.
 */
export type SsoSessionState = 'valid' | 'refreshable' | 'unverified' | 'expired' | 'missing';

/**
 * Whether an SSO session can still produce credentials. An expired access token
 * is not the end: with a refresh token and a live client registration the SDK
 * renews it silently, the way the aws CLI does — only without both is it dead.
 */
export function ssoSessionState(keySource: string, now = Date.now()): SsoSessionState {
  const cache = readCache(keySource);
  const expiresAt = parseDate(cache?.expiresAt);
  if (!cache?.accessToken || !expiresAt) return 'missing';
  if (expiresAt.getTime() > now) return 'valid';
  return cache.refreshToken && reusableRegistration(cache, now) ? 'refreshable' : 'expired';
}

/**
 * True when the cached token can be renewed. Without a refresh token (a legacy,
 * start-URL login) the access token itself lasts the whole Identity Center
 * session, so its expiry IS the session's end.
 */
export function ssoTokenRenewable(keySource: string): boolean {
  const cache = readCache(keySource);
  return Boolean(cache?.refreshToken && reusableRegistration(cache));
}

/** The login target recorded in a cached token — enough to refresh it. */
export function cachedSsoTarget(keySource: string, sessionName: string | null): SsoLoginTarget | null {
  const cache = readCache(keySource);
  if (!cache?.startUrl || !cache.region) return null;
  return { startUrl: cache.startUrl, region: cache.region, sessionName, scopes: [] };
}

export type RefreshOutcome =
  | { state: 'renewed'; accessToken: string; expiresAt: Date }
  /** Identity Center refused the refresh token: the session it belonged to is over. */
  | { state: 'ended' }
  /** No answer (offline, a timeout, a 5xx): nothing can be said about the session. */
  | { state: 'unverified' };

/**
 * Renew an expired SSO access token with its refresh token — what the SDK and
 * the aws CLI do on the next call anyway. It is also the only way to learn
 * whether the Identity Center session is still alive: AWS never says when the
 * session ends (the duration is an admin setting, 8 h by default), it simply
 * stops honouring the refresh token.
 */
export async function refreshSsoToken(target: SsoLoginTarget, timeoutMs = 8000): Promise<RefreshOutcome> {
  const cache = readCache(ssoCacheKeySource(target));
  const registration = reusableRegistration(cache);
  if (!registration || !cache?.refreshToken) return { state: 'ended' };

  const { CreateTokenCommand, SSOOIDCClient } = await import('@aws-sdk/client-sso-oidc');
  const client = new SSOOIDCClient({ region: target.region });
  try {
    const renewed = await client.send(
      new CreateTokenCommand({
        clientId: registration.clientId,
        clientSecret: registration.clientSecret,
        grantType: 'refresh_token',
        refreshToken: cache.refreshToken,
      }),
      { abortSignal: AbortSignal.timeout(timeoutMs) },
    );
    if (!renewed.accessToken) return { state: 'unverified' };
    const expiresAt = new Date(Date.now() + (renewed.expiresIn ?? 3600) * 1000);
    writeCache(target, {
      accessToken: renewed.accessToken,
      expiresAt: expiresAt.toISOString(),
      refreshToken: renewed.refreshToken ?? cache.refreshToken,
      clientId: registration.clientId,
      clientSecret: registration.clientSecret,
      registrationExpiresAt: cache.registrationExpiresAt,
    });
    return { state: 'renewed', accessToken: renewed.accessToken, expiresAt };
  } catch (err) {
    // A 4xx is Identity Center's answer (expired or revoked refresh token);
    // anything else — no network, a timeout, a 5xx — is no answer at all.
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    return status !== undefined && status >= 400 && status < 500 ? { state: 'ended' } : { state: 'unverified' };
  }
}

/**
 * The cache holds the access token, the refresh token and the client secret, so
 * it is private to the user — 0700 folder, 0600 file — the way the aws CLI keeps
 * it. Written world-readable, any account on the machine could sign in as you.
 */
export function writeCache(target: SsoLoginTarget, data: Omit<CachedSso, 'startUrl' | 'region'>): void {
  const dir = join(homedir(), '.aws', 'sso', 'cache');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = ssoCachePath(ssoCacheKeySource(target));
  writeFileSync(path, JSON.stringify({ startUrl: target.startUrl, region: target.region, ...data }, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  try {
    chmodSync(path, 0o600); // `mode` only applies to new files; tighten an old one too
  } catch {
    // no-op on Windows
  }
}

/**
 * A client registration is reusable while it hasn't expired. Reusing it is what
 * stops Identity Center from asking for consent on every single login: a fresh
 * RegisterClient looks like a brand-new application to AWS.
 */
function reusableRegistration(
  cache: CachedSso | null,
  now = Date.now(),
): { clientId: string; clientSecret: string } | null {
  if (!cache?.clientId || !cache.clientSecret) return null;
  const expiry = parseDate(cache.registrationExpiresAt);
  // Keep a minute of margin; treat "no expiry recorded" as unusable.
  if (!expiry || expiry.getTime() - 60_000 < now) return null;
  return { clientId: cache.clientId, clientSecret: cache.clientSecret };
}

// ── PKCE (authorization code flow, what the modern aws CLI uses) ─────────────

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const CALLBACK_HTML = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>awswiz</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0d1117;color:#e6edf3">
<div style="text-align:center"><h1 style="font-weight:500">${title}</h1><p style="color:#8b949e">${body}</p></div>
</body></html>`;

/**
 * Listen on a random loopback port and resolve with the authorization code AWS
 * redirects back with. The browser lands here, so no code typing is needed.
 */
export interface CallbackServer {
  redirectUri: string;
  waitForCode: (timeoutMs: number) => Promise<string>;
  close: () => void;
}

export function startCallbackServer(state: string): Promise<CallbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });
    // The redirect can land before waitForCode attaches its handler (or the
    // caller may never attach one at all). Node treats that as an unhandled
    // rejection and kills the process, so keep a no-op handler on the original;
    // waitForCode still sees the rejection through its own reference.
    codePromise.catch(() => {});
    let timer: NodeJS.Timeout | undefined;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');

      // Without this the browser holds the socket open (keep-alive) and the
      // process refuses to exit long after the sign-in finished.
      const headers = { 'content-type': 'text/html; charset=utf-8', connection: 'close' };

      const fail = (message: string) => {
        res.writeHead(400, headers);
        res.end(CALLBACK_HTML('Sign-in failed', message));
        rejectCode(new Error(message));
      };

      if (error) return fail(error);
      if (!code) return fail('No authorization code was returned.');
      if (returnedState !== state) return fail('State mismatch — the response did not match this request.');

      res.writeHead(200, headers);
      res.end(CALLBACK_HTML('Signed in ✔', 'You can close this window and go back to the terminal.'));
      resolveCode(code);
    });

    server.on('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolveServer({
        redirectUri: `http://127.0.0.1:${port}/oauth/callback`,
        // The losing side of the race must be cleaned up: a pending timer keeps
        // Node's event loop alive, which left the terminal blocked for the full
        // timeout after an otherwise successful sign-in.
        waitForCode: (timeoutMs) =>
          Promise.race([
            codePromise,
            new Promise<string>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(t('Timed out waiting for the browser sign-in.'))),
                timeoutMs,
              );
            }),
          ]).finally(() => {
            if (timer) clearTimeout(timer);
          }),
        close: () => {
          if (timer) clearTimeout(timer);
          // Sockets already established survive server.close(), so drop them
          // explicitly — otherwise the event loop stays alive.
          server.closeAllConnections?.();
          server.close();
        },
      });
    });
  });
}

function friendly(err: unknown): AwswizError {
  const name = (err as Error).name ?? 'Error';
  return new AwswizError(`${t('SSO login failed')}: ${(err as Error).message}`, { hint: `(${name})` });
}

// ── Login ────────────────────────────────────────────────────────────────────

export interface SsoLoginOptions {
  target: SsoLoginTarget;
  /** Force a full browser sign-in even when a cached token/refresh token exists. */
  force?: boolean;
  /** Use the device-code flow instead of the browser redirect. */
  deviceCode?: boolean;
  /** Called when the user must act: browser opened, or a code must be entered. */
  onPrompt: (info: { url: string; userCode?: string }) => void;
}

/**
 * Sign in to IAM Identity Center, preferring the least intrusive path:
 *   1. a still-valid cached token        → nothing happens at all
 *   2. a refresh token                   → silent renewal, no browser
 *   3. authorization code + PKCE         → browser opens straight to SSO
 *   4. device code                       → fallback (enter a code manually)
 * Client registrations are cached and reused, which is what keeps Identity
 * Center from asking for consent on every login.
 */
export async function ssoLogin(opts: SsoLoginOptions): Promise<SsoLoginResult> {
  const { target } = opts;
  const cache = readCache(ssoCacheKeySource(target));
  const registration = reusableRegistration(cache);

  // 1. Still signed in? Don't touch the browser — or even load the SDK.
  if (!opts.force) {
    const expiresAt = parseDate(cache?.expiresAt);
    if (cache?.accessToken && expiresAt && expiresAt.getTime() - 60_000 > Date.now()) {
      return { accessToken: cache.accessToken, expiresAt, method: 'cached' };
    }
  }

  const { CreateTokenCommand, RegisterClientCommand, SSOOIDCClient, StartDeviceAuthorizationCommand } =
    await import('@aws-sdk/client-sso-oidc');
  const client = new SSOOIDCClient({ region: target.region });

  // 2. Expired but refreshable → renew silently, exactly like the aws CLI does.
  // If Identity Center refuses (the session ended), fall through to a sign-in.
  if (!opts.force && registration && cache?.refreshToken) {
    const renewed = await refreshSsoToken(target);
    if (renewed.state === 'renewed') {
      return { accessToken: renewed.accessToken, expiresAt: renewed.expiresAt, method: 'refreshed' };
    }
  }

  const scopes = target.scopes.length > 0 ? target.scopes : ['sso:account:access'];
  const useDeviceCode = opts.deviceCode === true;

  // 3. Browser redirect (PKCE) — the smooth path, no code to type.
  if (!useDeviceCode) {
    let callback: Awaited<ReturnType<typeof startCallbackServer>> | undefined;
    // Once the browser is open, the user is mid-sign-in: a denial or a timeout
    // is their answer, not a reason to start a second, device-code sign-in.
    let prompted = false;
    try {
      const state = base64Url(randomBytes(16));
      const verifier = base64Url(randomBytes(32));
      const challenge = base64Url(createHash('sha256').update(verifier).digest());
      callback = await startCallbackServer(state);

      // A registration is tied to its redirect URI, so a new port needs a new one.
      const reg = await client.send(
        new RegisterClientCommand({
          clientName: 'awswiz',
          clientType: 'public',
          scopes,
          redirectUris: [callback.redirectUri],
          grantTypes: ['authorization_code', 'refresh_token'],
          issuerUrl: target.startUrl,
        }),
      );

      const authorizeUrl = new URL(`https://oidc.${target.region}.amazonaws.com/authorize`);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', reg.clientId ?? '');
      authorizeUrl.searchParams.set('redirect_uri', callback.redirectUri);
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('code_challenge', challenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('scopes', scopes.join(','));

      opts.onPrompt({ url: authorizeUrl.toString() });
      prompted = true;

      const code = await callback.waitForCode(180_000);
      const tok = await client.send(
        new CreateTokenCommand({
          clientId: reg.clientId,
          clientSecret: reg.clientSecret,
          grantType: 'authorization_code',
          code,
          redirectUri: callback.redirectUri,
          codeVerifier: verifier,
        }),
      );

      const expiresAt = new Date(Date.now() + (tok.expiresIn ?? 3600) * 1000);
      writeCache(target, {
        accessToken: tok.accessToken ?? '',
        expiresAt: expiresAt.toISOString(),
        refreshToken: tok.refreshToken,
        clientId: reg.clientId,
        clientSecret: reg.clientSecret,
        registrationExpiresAt: reg.clientSecretExpiresAt
          ? new Date(reg.clientSecretExpiresAt * 1000).toISOString()
          : undefined,
      });
      recordSsoSignIn(ssoCacheKeySource(target));
      return { accessToken: tok.accessToken ?? '', expiresAt, method: 'browser' };
    } catch (err) {
      if ((err as Error).name === 'AwswizError') throw err;
      if (prompted) throw friendly(err);
      // Older Identity Center setups may not allow the redirect flow — the
      // device code path below still works everywhere.
    } finally {
      callback?.close();
    }
  }

  // 4. Device code — reusing the cached registration when we can.
  let reg: { clientId: string; clientSecret: string };
  let registrationExpiresAt: string | undefined;

  if (registration) {
    reg = registration;
    registrationExpiresAt = cache?.registrationExpiresAt;
  } else {
    const fresh = await client
      .send(new RegisterClientCommand({ clientName: 'awswiz', clientType: 'public', scopes }))
      .catch((err) => {
        throw friendly(err);
      });
    reg = { clientId: fresh.clientId ?? '', clientSecret: fresh.clientSecret ?? '' };
    registrationExpiresAt = fresh.clientSecretExpiresAt
      ? new Date(fresh.clientSecretExpiresAt * 1000).toISOString()
      : undefined;
  }

  const auth = await client
    .send(
      new StartDeviceAuthorizationCommand({
        clientId: reg.clientId,
        clientSecret: reg.clientSecret,
        startUrl: target.startUrl,
      }),
    )
    .catch((err) => {
      throw friendly(err);
    });

  opts.onPrompt({
    url: auth.verificationUriComplete ?? auth.verificationUri ?? target.startUrl,
    userCode: auth.userCode ?? '',
  });

  const interval = (auth.interval ?? 5) * 1000;
  const deadline = Date.now() + (auth.expiresIn ?? 600) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    try {
      const tok = await client.send(
        new CreateTokenCommand({
          clientId: reg.clientId,
          clientSecret: reg.clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode: auth.deviceCode,
        }),
      );
      const expiresAt = new Date(Date.now() + (tok.expiresIn ?? 3600) * 1000);
      writeCache(target, {
        accessToken: tok.accessToken ?? '',
        expiresAt: expiresAt.toISOString(),
        refreshToken: tok.refreshToken,
        clientId: reg.clientId,
        clientSecret: reg.clientSecret,
        registrationExpiresAt,
      });
      recordSsoSignIn(ssoCacheKeySource(target));
      return { accessToken: tok.accessToken ?? '', expiresAt, method: 'device-code' };
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'AuthorizationPendingException') continue;
      if (name === 'SlowDownException') {
        await sleep(interval);
        continue;
      }
      throw friendly(err);
    }
  }

  throw new AwswizError(t('SSO login timed out — the code expired before it was approved.'));
}
