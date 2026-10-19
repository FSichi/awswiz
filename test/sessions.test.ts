import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execCommand } from '../src/commands/exec.js';
import { collectStatus } from '../src/commands/status.js';
import { assertSessionTarget, getCredentialKeys } from '../src/core/aws-files.js';
import { writeCredentials } from '../src/core/aws-writer.js';
import { readSsoSignIn, recordSsoSignIn } from '../src/core/sso-sign-ins.js';
import { ssoCachePath, ssoSessionState, writeCache } from '../src/core/sso.js';

// Identity Center, faked: each test says how it answers a refresh.
const oidc = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-sso-oidc', () => ({
  SSOOIDCClient: class {
    send = oidc.send;
  },
  CreateTokenCommand: class {
    constructor(public input: unknown) {}
  },
}));

// A throwaway home: ~/.aws/config, ~/.aws/credentials and ~/.aws/sso/cache all
// live here, never in the real one.
let home: string;
const saved = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  AWS_PROFILE: process.env.AWS_PROFILE,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
};

function writeAws(config: string, credentials: string): void {
  mkdirSync(join(home, '.aws'), { recursive: true });
  writeFileSync(join(home, '.aws', 'config'), config);
  writeFileSync(join(home, '.aws', 'credentials'), credentials);
}

function writeSsoCache(key: string, data: Record<string, string>): void {
  const path = ssoCachePath(key);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'awswiz-home-'));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.XDG_CONFIG_HOME = join(home, '.config');
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_CONFIG_FILE;
  delete process.env.AWS_SHARED_CREDENTIALS_FILE;
});

afterEach(() => {
  process.env.HOME = saved.HOME;
  process.env.USERPROFILE = saved.USERPROFILE;
  if (saved.AWS_PROFILE === undefined) delete process.env.AWS_PROFILE;
  else process.env.AWS_PROFILE = saved.AWS_PROFILE;
  if (saved.XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = saved.XDG_CONFIG_HOME;
  oidc.send.mockReset();
  rmSync(home, { recursive: true, force: true });
});

const HOUR = 3600_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

describe('ssoSessionState', () => {
  it('is missing before any sign-in', () => {
    expect(ssoSessionState('corp')).toBe('missing');
  });

  it('is valid while the access token lasts', () => {
    writeSsoCache('corp', { accessToken: 'a', expiresAt: iso(HOUR) });
    expect(ssoSessionState('corp')).toBe('valid');
  });

  // The SDK renews these silently — exec must not refuse to run on them.
  it('is refreshable when the token expired but a refresh token and registration remain', () => {
    writeSsoCache('corp', {
      accessToken: 'a',
      expiresAt: iso(-HOUR),
      refreshToken: 'r',
      clientId: 'c',
      clientSecret: 's',
      registrationExpiresAt: iso(30 * 24 * HOUR),
    });
    expect(ssoSessionState('corp')).toBe('refreshable');
  });

  it('is expired when nothing can renew it', () => {
    writeSsoCache('corp', { accessToken: 'a', expiresAt: iso(-HOUR) });
    expect(ssoSessionState('corp')).toBe('expired');
  });
});

describe('collectStatus (status --json)', () => {
  it('reports sessions and SSO state without any secret', async () => {
    writeAws(
      '[profile dev]\nregion = eu-west-1\n\n[profile corp]\nsso_session = corp\n\n[sso-session corp]\nsso_start_url = https://x.awsapps.com/start\nsso_region = us-east-1\n',
      `[dev]\naws_access_key_id = AKIA\naws_secret_access_key = SECRET\n\n[dev-mfa]\naws_access_key_id = ASIA\naws_secret_access_key = SECRET\naws_session_token = TOKEN\naws_session_expiration = ${iso(-HOUR)}\n`,
    );
    writeSsoCache('corp', { accessToken: 'TOKEN', expiresAt: iso(HOUR) });

    const report = await collectStatus();
    expect(report.activeProfile).toBe('default');
    expect(report.sessions).toEqual([
      { profile: 'dev-mfa', expiresAt: expect.any(String), state: 'expired', renew: 'awswiz mfa -p dev' },
    ]);
    expect(report.sso).toEqual([
      {
        profile: 'corp',
        ssoSession: 'corp',
        state: 'valid',
        expiresAt: expect.any(String),
        signedInAt: null,
        // no refresh token: the session ends with this token
        sessionEndsAt: expect.any(String),
        sessionEndSource: 'token',
        renew: null,
      },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/SECRET|TOKEN|AKIA|ASIA/);
  });
});

describe('SSO sessions behind an expired token', () => {
  const CONFIG =
    '[profile corp]\nsso_session = corp\n\n[profile corp-admin]\nsso_session = corp\n\n[sso-session corp]\nsso_start_url = https://x.awsapps.com/start\nsso_region = us-east-1\n';
  const target = { startUrl: 'https://x.awsapps.com/start', region: 'us-east-1', sessionName: 'corp', scopes: [] };
  const expiredButRenewable = () =>
    writeCache(target, {
      accessToken: 'OLD',
      expiresAt: iso(-HOUR),
      refreshToken: 'REFRESH',
      clientId: 'CLIENT',
      clientSecret: 'SECRET',
      registrationExpiresAt: iso(30 * 24 * HOUR),
    });

  beforeEach(() => {
    writeAws(CONFIG, '');
    expiredButRenewable();
  });

  // The renewal is the check: a session that still works comes back with a new
  // token, once for every profile that shares it.
  it('asks Identity Center once and reports a live session as signed in', async () => {
    oidc.send.mockResolvedValue({ accessToken: 'NEW', expiresIn: 3600, refreshToken: 'REFRESH2' });
    const report = await collectStatus();
    expect(oidc.send).toHaveBeenCalledTimes(1);
    expect(report.sso.map((s) => s.state)).toEqual(['valid', 'valid']);
    expect(new Date(report.sso[0]!.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    expect(ssoSessionState('corp')).toBe('valid'); // the new token was cached
    expect(JSON.stringify(report)).not.toMatch(/NEW|REFRESH|SECRET/);
  });

  // What the screenshot showed: a session dead for days listed as "renews automatically".
  it('reports an ended session when Identity Center refuses the refresh token', async () => {
    oidc.send.mockRejectedValue(Object.assign(new Error('invalid_grant'), { $metadata: { httpStatusCode: 400 } }));
    const report = await collectStatus();
    expect(report.sso[0]).toMatchObject({ state: 'expired', renew: 'awswiz login -p corp' });
  });

  it('says it could not check when Identity Center is unreachable', async () => {
    oidc.send.mockRejectedValue(new Error('getaddrinfo ENOTFOUND oidc.us-east-1.amazonaws.com'));
    const report = await collectStatus();
    expect(report.sso[0]).toMatchObject({ state: 'unverified', renew: null });
  });

  it('does not touch the network with --offline', async () => {
    const report = await collectStatus({ verify: false });
    expect(oidc.send).not.toHaveBeenCalled();
    expect(report.sso[0]!.state).toBe('refreshable');
  });

  // Non-interactive (agents, CI): stop before the command instead of failing halfway.
  it('makes exec stop on an ended session', async () => {
    oidc.send.mockRejectedValue(Object.assign(new Error('invalid_grant'), { $metadata: { httpStatusCode: 400 } }));
    await expect(execCommand(['node', '--version'], { profile: 'corp' })).rejects.toThrow(/expired/);
  });
});

describe('when the SSO session ends', () => {
  const target = { startUrl: 'https://x.awsapps.com/start', region: 'us-east-1', sessionName: 'corp', scopes: [] };
  const renewableToken = () =>
    writeCache(target, {
      accessToken: 'a',
      expiresAt: iso(HOUR),
      refreshToken: 'r',
      clientId: 'c',
      clientSecret: 's',
      registrationExpiresAt: iso(30 * 24 * HOUR),
    });
  const config = (extra = '') =>
    `[profile corp]\nsso_session = corp\n\n[sso-session corp]\nsso_start_url = https://x.awsapps.com/start\nsso_region = us-east-1\n${extra}`;

  it('counts from the recorded sign-in with the configured duration', async () => {
    writeAws(config('awswiz_session_duration = 8h\n'), '');
    renewableToken();
    const signedIn = new Date(Date.now() - 2 * HOUR);
    recordSsoSignIn('corp', signedIn);
    const [corp] = (await collectStatus()).sso;
    expect(corp).toMatchObject({ state: 'valid', signedInAt: signedIn.toISOString(), sessionEndSource: 'config' });
    expect(corp!.sessionEndsAt).toBe(new Date(signedIn.getTime() + 8 * HOUR).toISOString());
  });

  it('shows no end without a configured duration, or once the estimate is proven wrong', async () => {
    renewableToken();
    recordSsoSignIn('corp', new Date(Date.now() - 10 * HOUR));
    writeAws(config(), '');
    expect((await collectStatus()).sso[0]!.sessionEndsAt).toBeNull();
    writeAws(config('awswiz_session_duration = 8h\n'), ''); // ended 2h ago, yet the token works
    expect((await collectStatus()).sso[0]!.sessionEndsAt).toBeNull();
  });

  // A token without a refresh token lasts exactly as long as the session.
  it('uses the token expiry when the token cannot be renewed', async () => {
    writeAws(config(), '');
    writeSsoCache('corp', { accessToken: 'a', expiresAt: iso(5 * HOUR) });
    const [corp] = (await collectStatus()).sso;
    expect(corp).toMatchObject({ sessionEndSource: 'token', sessionEndsAt: corp!.expiresAt });
  });

  it('keeps sign-in records per session', () => {
    expect(readSsoSignIn('corp')).toBeNull();
    const at = new Date('2026-10-19T13:25:00Z');
    recordSsoSignIn('corp', at);
    recordSsoSignIn('https://other.awsapps.com/start');
    expect(readSsoSignIn('corp')?.toISOString()).toBe(at.toISOString());
    expect(readSsoSignIn('https://other.awsapps.com/start')).not.toBeNull();
  });
});

describe('assertSessionTarget', () => {
  beforeEach(() => {
    writeAws(
      '[profile corp]\nsso_session = corp\n\n[profile only-region]\nregion = us-east-1\n',
      '[dev]\naws_access_key_id = AKIA\naws_secret_access_key = s\n\n[dev-mfa]\naws_access_key_id = ASIA\naws_secret_access_key = s\naws_session_token = t\n',
    );
  });

  // `assume` names the profile after the role: a role called "dev" used to
  // overwrite the long-lived keys of an existing "dev" profile.
  it('refuses to put temporary credentials over a real profile', async () => {
    await expect(assertSessionTarget('dev')).rejects.toThrow(/keys profile/);
    await expect(assertSessionTarget('corp')).rejects.toThrow(/sso profile/);
  });

  it('allows a new name, a session profile or a config-only profile', async () => {
    await expect(assertSessionTarget('brand-new')).resolves.toBeUndefined();
    await expect(assertSessionTarget('dev-mfa')).resolves.toBeUndefined();
    await expect(assertSessionTarget('only-region')).resolves.toBeUndefined();
  });
});

describe('reads after writes', () => {
  // The SDK caches ~/.aws per process; awswiz must see what it just wrote.
  it('sees credentials written earlier in the same process', async () => {
    writeAws('', '[dev]\naws_access_key_id = OLD\n');
    expect((await getCredentialKeys('dev')).aws_access_key_id).toBe('OLD');
    writeCredentials('dev', { aws_access_key_id: 'NEW' });
    expect((await getCredentialKeys('dev')).aws_access_key_id).toBe('NEW');
  });
});

describe('sso cache permissions', () => {
  // It holds the access token, the refresh token and the client secret.
  it.skipIf(process.platform === 'win32')('keeps the SSO token cache private', () => {
    const target = { startUrl: 'https://x.awsapps.com/start', region: 'us-east-1', sessionName: 'corp', scopes: [] };
    writeCache(target, { accessToken: 'a', expiresAt: iso(HOUR) });
    expect(statSync(ssoCachePath('corp')).mode & 0o777).toBe(0o600);
    expect(statSync(join(ssoCachePath('corp'), '..')).mode & 0o777).toBe(0o700);
  });
});
