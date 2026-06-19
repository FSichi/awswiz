import { describe, expect, it } from 'vitest';
import { getSection, parseIni, removeSection, serializeIni, upsertSection } from '../src/core/aws-ini.js';

function roundtrip(text: string): string {
  return serializeIni(parseIni(text));
}

describe('aws-ini editor', () => {
  it('round-trips a file unchanged (preserving comments and blanks)', () => {
    const text = '# my creds\n\n[default]\naws_access_key_id = AKIA\naws_secret_access_key = secret\n\n[dev]\nregion = us-east-1\n';
    expect(roundtrip(text)).toBe(text);
  });

  it('updates an existing key in place, leaving the rest intact', () => {
    const doc = parseIni('[dev]\n# keep me\nregion = us-east-1\naws_access_key_id = AKIA\n');
    upsertSection(doc, 'dev', { region: 'eu-west-2' });
    const out = serializeIni(doc);
    expect(out).toContain('region = eu-west-2');
    expect(out).toContain('# keep me');
    expect(out).toContain('aws_access_key_id = AKIA');
    expect(out.match(/region =/g)).toHaveLength(1);
  });

  it('appends a new key to an existing section', () => {
    const doc = parseIni('[dev]\nregion = us-east-1\n');
    upsertSection(doc, 'dev', { aws_session_token: 'tok' });
    expect(serializeIni(doc)).toBe('[dev]\nregion = us-east-1\naws_session_token = tok\n');
  });

  it('creates a new section when missing, separated by a blank line', () => {
    const doc = parseIni('[default]\nregion = us-east-1\n');
    upsertSection(doc, 'profile prod', { region: 'eu-west-1', mfa_serial: 'arn:aws:iam::1:mfa/me' });
    const out = serializeIni(doc);
    expect(out).toBe(
      '[default]\nregion = us-east-1\n\n[profile prod]\nregion = eu-west-1\nmfa_serial = arn:aws:iam::1:mfa/me\n',
    );
  });

  it('creates a section in an empty file', () => {
    const doc = parseIni('');
    upsertSection(doc, 'default', { aws_access_key_id: 'AKIA', aws_secret_access_key: 's' });
    expect(serializeIni(doc)).toBe('[default]\naws_access_key_id = AKIA\naws_secret_access_key = s\n');
  });

  it('reads a section back as key/values, ignoring comments', () => {
    const doc = parseIni('[dev]\n# comment\nregion = us-east-1\nmfa_serial = arn\n');
    expect(getSection(doc, 'dev')).toEqual({ region: 'us-east-1', mfa_serial: 'arn' });
    expect(getSection(doc, 'ghost')).toBeNull();
  });

  it('removes a section', () => {
    const doc = parseIni('[default]\nregion = us-east-1\n\n[dev]\nregion = eu-west-1\n');
    expect(removeSection(doc, 'dev')).toBe(true);
    expect(removeSection(doc, 'ghost')).toBe(false);
    expect(serializeIni(doc)).toBe('[default]\nregion = us-east-1\n');
  });

  it('preserves CRLF line endings', () => {
    const doc = parseIni('[dev]\r\nregion = us-east-1\r\n');
    upsertSection(doc, 'dev', { region: 'eu-west-1' });
    const out = serializeIni(doc);
    expect(out).toContain('\r\n');
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('handles AWS config "profile " prefixed headers distinctly from credentials', () => {
    const doc = parseIni('[default]\nregion = us-east-1\n\n[profile dev]\nregion = eu-west-1\n');
    upsertSection(doc, 'profile dev', { region: 'eu-west-2' });
    expect(getSection(doc, 'profile dev')).toEqual({ region: 'eu-west-2' });
    expect(getSection(doc, 'default')).toEqual({ region: 'us-east-1' });
  });
});
