import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSection, parseIni } from '../src/core/aws-ini.js';
import {
  copyProfileToDefault,
  removeProfile,
  replaceCredentials,
  writeConfigProfile,
  writeCredentials,
} from '../src/core/aws-writer.js';

let dir: string;
const configPath = () => join(dir, 'config');
const credsPath = () => join(dir, 'credentials');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'awswiz-writer-'));
  process.env.AWS_CONFIG_FILE = configPath();
  process.env.AWS_SHARED_CREDENTIALS_FILE = credsPath();
});

afterEach(() => {
  delete process.env.AWS_CONFIG_FILE;
  delete process.env.AWS_SHARED_CREDENTIALS_FILE;
  rmSync(dir, { recursive: true, force: true });
});

describe('aws-writer', () => {
  it('creates the credentials file and profile from scratch', () => {
    writeCredentials('dev', { aws_access_key_id: 'AKIA1', aws_secret_access_key: 's3cret' });
    const text = readFileSync(credsPath(), 'utf8');
    expect(text).toContain('[dev]');
    expect(text).toContain('aws_access_key_id = AKIA1');
    expect(text).toContain('aws_secret_access_key = s3cret');
  });

  it('updates keys in place on rewrite (no duplicates)', () => {
    writeCredentials('dev', { aws_access_key_id: 'OLD', aws_session_token: 'tok1' });
    writeCredentials('dev', { aws_access_key_id: 'NEW' });
    const text = readFileSync(credsPath(), 'utf8');
    expect(text).toContain('aws_access_key_id = NEW');
    expect(text).not.toContain('OLD');
    expect(text).toContain('aws_session_token = tok1'); // untouched keys survive
    expect(text.match(/aws_access_key_id/g)).toHaveLength(1);
  });

  it('uses the "profile X" header in config, but bare [default]', () => {
    writeConfigProfile('dev', { region: 'eu-west-1' });
    writeConfigProfile('default', { region: 'us-east-1' });
    const text = readFileSync(configPath(), 'utf8');
    expect(text).toContain('[profile dev]');
    expect(text).toContain('[default]');
    expect(text).not.toContain('[profile default]');
  });

  it('removeProfile deletes from both files and reports absence', () => {
    writeCredentials('gone', { aws_access_key_id: 'A' });
    writeConfigProfile('gone', { region: 'us-east-1' });
    expect(removeProfile('gone')).toBe(true);
    expect(readFileSync(credsPath(), 'utf8')).not.toContain('[gone]');
    expect(readFileSync(configPath(), 'utf8')).not.toContain('[profile gone]');
    expect(removeProfile('ghost')).toBe(false);
  });

  it('copyProfileToDefault mirrors credentials and config into [default]', () => {
    writeCredentials('prod', { aws_access_key_id: 'AKIA9', aws_secret_access_key: 'x' });
    writeConfigProfile('prod', { region: 'sa-east-1' });
    copyProfileToDefault('prod');
    const creds = readFileSync(credsPath(), 'utf8');
    const config = readFileSync(configPath(), 'utf8');
    expect(creds).toMatch(/\[default\][^[]*aws_access_key_id = AKIA9/s);
    expect(config).toMatch(/\[default\][^[]*region = sa-east-1/s);
  });

  // Merging kept the previous identity's keys: an old session token next to new
  // keys, or static keys that outrank an SSO config.
  it('copyProfileToDefault replaces [default] instead of merging into it', () => {
    writeCredentials('work-mfa', { aws_access_key_id: 'ASIA1', aws_secret_access_key: 's', aws_session_token: 'tok' });
    writeCredentials('prod', { aws_access_key_id: 'AKIA9', aws_secret_access_key: 'x' });
    copyProfileToDefault('work-mfa');
    copyProfileToDefault('prod');
    const defaultCreds = getSection(parseIni(readFileSync(credsPath(), 'utf8')), 'default');
    expect(defaultCreds).toEqual({ aws_access_key_id: 'AKIA9', aws_secret_access_key: 'x' });
  });

  it('copyProfileToDefault drops [default] keys when the profile is SSO', () => {
    writeCredentials('work-mfa', { aws_access_key_id: 'ASIA1', aws_secret_access_key: 's', aws_session_token: 'tok' });
    copyProfileToDefault('work-mfa');
    writeConfigProfile('corp', { sso_session: 'corp', sso_account_id: '123456789012', sso_role_name: 'Dev' });
    copyProfileToDefault('corp');
    const creds = parseIni(readFileSync(credsPath(), 'utf8'));
    const config = parseIni(readFileSync(configPath(), 'utf8'));
    expect(getSection(creds, 'default')).toBeNull();
    expect(getSection(config, 'default')).toEqual({
      sso_session: 'corp',
      sso_account_id: '123456789012',
      sso_role_name: 'Dev',
    });
  });

  it('saves keys that only [default] had before replacing them', () => {
    writeCredentials('default', { aws_access_key_id: 'AKIAONLY', aws_secret_access_key: 'mine' });
    writeConfigProfile('corp', { sso_session: 'corp' });
    expect(copyProfileToDefault('corp').backedUpAs).toBe('default-backup');
    expect(getSection(parseIni(readFileSync(credsPath(), 'utf8')), 'default-backup')).toEqual({
      aws_access_key_id: 'AKIAONLY',
      aws_secret_access_key: 'mine',
    });
  });

  it('does not back up [default] keys that another profile also has', () => {
    writeCredentials('default', { aws_access_key_id: 'AKIA9', aws_secret_access_key: 'x' });
    writeCredentials('prod', { aws_access_key_id: 'AKIA9', aws_secret_access_key: 'x' });
    expect(copyProfileToDefault('prod').backedUpAs).toBeNull();
  });

  it('refuses a profile whose credentials come from default itself', () => {
    writeConfigProfile('admin', { role_arn: 'arn:aws:iam::1:role/A', source_profile: 'default' });
    expect(() => copyProfileToDefault('admin')).toThrow(/cannot become default/);
  });

  it('replaceCredentials keeps only the new keys (and comments)', () => {
    writeFileSync(credsPath(), '[dev]\n# mine\naws_access_key_id = OLD\naws_session_token = stale\n');
    replaceCredentials('dev', { aws_access_key_id: 'NEW', aws_secret_access_key: 's' });
    expect(readFileSync(credsPath(), 'utf8')).toBe('[dev]\n# mine\naws_access_key_id = NEW\naws_secret_access_key = s\n');
  });

  it('writes into an existing "[profile default]" header instead of adding a second one', () => {
    writeFileSync(configPath(), '[profile default]\nregion = us-east-1\n');
    writeConfigProfile('default', { region: 'eu-west-1' });
    expect(readFileSync(configPath(), 'utf8')).toBe('[profile default]\nregion = eu-west-1\n');
  });

  it.skipIf(process.platform === 'win32')('creates the credentials file private (0600) and keeps it so', () => {
    writeCredentials('dev', { aws_access_key_id: 'A' });
    expect(statSync(credsPath()).mode & 0o777).toBe(0o600);
    writeCredentials('dev', { aws_secret_access_key: 'B' });
    expect(statSync(credsPath()).mode & 0o777).toBe(0o600);
  });

  it('leaves no temp file behind', () => {
    writeCredentials('dev', { aws_access_key_id: 'A' });
    writeConfigProfile('dev', { region: 'us-east-1' });
    expect(readdirSync(dir).sort()).toEqual(['config', 'credentials']);
  });
});
