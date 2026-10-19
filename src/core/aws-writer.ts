import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { awsFilePaths, markAwsFilesChanged } from './aws-files.js';
import {
  getSection,
  hasSection,
  parseIni,
  removeSection,
  replaceSection,
  serializeIni,
  upsertSection,
  type IniDoc,
} from './aws-ini.js';

function readDoc(path: string): IniDoc {
  return parseIni(existsSync(path) ? readFileSync(path, 'utf8') : '');
}

/**
 * Write an AWS file atomically: a temp file next to the real one, then a rename,
 * so a crash or a full disk never leaves ~/.aws/credentials half-written. A
 * symlinked file is written through to its target (the link survives), and the
 * file keeps its permissions — secrets are created 0600 from the first byte
 * instead of being world-readable until a later chmod.
 */
function writeDoc(path: string, doc: IniDoc, secret = false): void {
  mkdirSync(dirname(path), { recursive: true });
  const target = existsSync(path) ? realpathSync(path) : path;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : secret ? 0o600 : 0o644;
  const text = serializeIni(doc);
  const temp = `${target}.awswiz-${process.pid}.tmp`;
  try {
    writeFileSync(temp, text, { encoding: 'utf8', mode });
    renameSync(temp, target);
  } catch {
    // Some Windows setups (antivirus, an editor holding the file) refuse the
    // rename; a direct write is still better than failing the command.
    rmSync(temp, { force: true });
    writeFileSync(target, text, { encoding: 'utf8', mode });
  }
  if (secret) {
    try {
      chmodSync(target, 0o600); // no-op on Windows; also tightens a pre-existing loose file
    } catch {
      // best effort
    }
  }
  markAwsFilesChanged();
}

/** Header used in ~/.aws/config: "default" stays bare, others get the "profile " prefix. */
export function configHeader(profile: string): string {
  return profile === 'default' ? 'default' : `profile ${profile}`;
}

/** The header a profile already has in this config doc — AWS accepts "[profile default]" too. */
function configSectionName(doc: IniDoc, profile: string): string {
  if (profile === 'default' && !hasSection(doc, 'default') && hasSection(doc, 'profile default')) {
    return 'profile default';
  }
  return configHeader(profile);
}

/** Write long-lived or temporary credentials into ~/.aws/credentials (chmod 0600). */
export function writeCredentials(profile: string, kv: Record<string, string>): void {
  const { credentialsFile } = awsFilePaths();
  const doc = readDoc(credentialsFile);
  upsertSection(doc, profile, kv);
  writeDoc(credentialsFile, doc, true);
}

/**
 * Make a profile's credentials exactly these keys — for a new identity (other
 * keys, a fresh session) where anything left from the old one would mix in.
 */
export function replaceCredentials(profile: string, kv: Record<string, string>): void {
  const { credentialsFile } = awsFilePaths();
  const doc = readDoc(credentialsFile);
  replaceSection(doc, profile, kv);
  writeDoc(credentialsFile, doc, true);
}

/** Write profile settings (region, sso_*, role_arn, mfa_serial…) into ~/.aws/config. */
export function writeConfigProfile(profile: string, kv: Record<string, string>): void {
  const { configFile } = awsFilePaths();
  const doc = readDoc(configFile);
  upsertSection(doc, configSectionName(doc, profile), kv);
  writeDoc(configFile, doc);
}

/** Make a profile's config section exactly these settings (see replaceCredentials). */
export function replaceConfigProfile(profile: string, kv: Record<string, string>): void {
  const { configFile } = awsFilePaths();
  const doc = readDoc(configFile);
  replaceSection(doc, configSectionName(doc, profile), kv);
  writeDoc(configFile, doc);
}

/** Remove a profile's credentials, keeping its config (e.g. a profile turned into SSO). */
export function removeCredentials(profile: string): boolean {
  const { credentialsFile } = awsFilePaths();
  const doc = readDoc(credentialsFile);
  if (!removeSection(doc, profile)) return false;
  writeDoc(credentialsFile, doc, true);
  return true;
}

/** Remove a profile from both files. Returns true if anything was removed. */
export function removeProfile(profile: string): boolean {
  const { configFile, credentialsFile } = awsFilePaths();
  let removed = false;

  const creds = readDoc(credentialsFile);
  if (removeSection(creds, profile)) {
    writeDoc(credentialsFile, creds, true);
    removed = true;
  }
  const config = readDoc(configFile);
  if (removeSection(config, configSectionName(config, profile))) {
    writeDoc(configFile, config);
    removed = true;
  }
  return removed;
}

/**
 * Long-lived keys held by [default] and by no other profile — the ones that
 * would be lost for good if [default] were overwritten. Null when there are none.
 */
export function defaultOnlyKeys(): Record<string, string> | null {
  const { credentialsFile } = awsFilePaths();
  const doc = readDoc(credentialsFile);
  const keys = getSection(doc, 'default');
  if (!keys?.aws_access_key_id || keys.aws_session_token) return null;
  const elsewhere = doc.sections.some(
    (s) => s.name !== 'default' && getSection(doc, s.name)?.aws_access_key_id === keys.aws_access_key_id,
  );
  return elsewhere ? null : keys;
}

export interface CopyToDefaultResult {
  /** Profile the previous [default] keys were saved as, when they existed nowhere else. */
  backedUpAs: string | null;
}

/**
 * Make [default] exactly the given profile, in both files (for `awswiz use --default`).
 * Replaces rather than merges: merging left a previous session token beside new
 * keys, or old static keys that outrank an SSO config, so "default" kept being
 * the previous identity. Keys that existed only in [default] are saved first.
 */
export function copyProfileToDefault(profile: string): CopyToDefaultResult {
  const { configFile, credentialsFile } = awsFilePaths();
  let backedUpAs: string | null = null;

  const config = readDoc(configFile);
  const cfgKv = getSection(config, configSectionName(config, profile)) ?? {};
  // [default] would end up pointing at itself for its credentials.
  if (cfgKv.source_profile === 'default') {
    throw new AwswizError(t('"{profile}" takes its credentials from default, so it cannot become default.', { profile }), {
      hint: t('Use it through AWS_PROFILE instead: awswiz use {profile}', { profile }),
    });
  }

  const creds = readDoc(credentialsFile);
  const credKv = getSection(creds, profile);
  const ownKeys = defaultOnlyKeys();
  if (ownKeys && profile !== 'default') {
    backedUpAs = hasSection(creds, 'default-backup')
      ? `default-backup-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
      : 'default-backup';
    replaceSection(creds, backedUpAs, ownKeys);
  }
  if (credKv && Object.keys(credKv).length > 0) {
    replaceSection(creds, 'default', credKv);
  } else {
    // An SSO or role profile has no keys: any left in [default] would win over it.
    removeSection(creds, 'default');
  }
  writeDoc(credentialsFile, creds, true);

  replaceSection(config, configSectionName(config, 'default'), cfgKv);
  writeDoc(configFile, config);

  return { backedUpAs };
}
