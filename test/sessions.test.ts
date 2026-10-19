import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectStatus } from '../src/commands/status.js';
import { assertSessionTarget, getCredentialKeys } from '../src/core/aws-files.js';
import { writeCredentials } from '../src/core/aws-writer.js';
import { ssoCachePath, ssoSessionState, writeCache } from '../src/core/sso.js';

// A throwaway home: ~/.aws/config, ~/.aws/credentials and ~/.aws/sso/cache all
// live here, never in the real one.
let home: string;
const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, AWS_PROFILE: process.env.AWS_PROFILE };

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
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_CONFIG_FILE;
  delete process.env.AWS_SHARED_CREDENTIALS_FILE;
});

afterEach(() => {
  process.env.HOME = saved.HOME;
  process.env.USERPROFILE = saved.USERPROFILE;
  if (saved.AWS_PROFILE === undefined) delete process.env.AWS_PROFILE;
  else process.env.AWS_PROFILE = saved.AWS_PROFILE;
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
      { profile: 'corp', ssoSession: 'corp', expiresAt: expect.any(String), state: 'valid', renew: null },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/SECRET|TOKEN|AKIA|ASIA/);
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
