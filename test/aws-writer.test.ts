import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  copyProfileToDefault,
  removeProfile,
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
});
