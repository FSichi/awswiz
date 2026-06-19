import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { awsFilePaths } from './aws-files.js';
import { getSection, parseIni, removeSection, serializeIni, upsertSection } from './aws-ini.js';

function readDoc(path: string) {
  return parseIni(existsSync(path) ? readFileSync(path, 'utf8') : '');
}

function writeDoc(path: string, doc: ReturnType<typeof parseIni>, secret = false): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeIni(doc), 'utf8');
  if (secret) {
    try {
      chmodSync(path, 0o600); // no-op on Windows, important on Unix
    } catch {
      // best effort
    }
  }
}

/** Header used in ~/.aws/config: "default" stays bare, others get the "profile " prefix. */
export function configHeader(profile: string): string {
  return profile === 'default' ? 'default' : `profile ${profile}`;
}

/** Write long-lived or temporary credentials into ~/.aws/credentials (chmod 0600). */
export function writeCredentials(profile: string, kv: Record<string, string>): void {
  const { credentialsFile } = awsFilePaths();
  const doc = readDoc(credentialsFile);
  upsertSection(doc, profile, kv);
  writeDoc(credentialsFile, doc, true);
}

/** Write profile settings (region, sso_*, role_arn, mfa_serial…) into ~/.aws/config. */
export function writeConfigProfile(profile: string, kv: Record<string, string>): void {
  const { configFile } = awsFilePaths();
  const doc = readDoc(configFile);
  upsertSection(doc, configHeader(profile), kv);
  writeDoc(configFile, doc);
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
  if (removeSection(config, configHeader(profile))) {
    writeDoc(configFile, config);
    removed = true;
  }
  return removed;
}

/** Copy every key of a profile into the [default] sections of both files (for `awswiz use`). */
export function copyProfileToDefault(profile: string): void {
  const { configFile, credentialsFile } = awsFilePaths();

  const creds = readDoc(credentialsFile);
  const credKv = getSection(creds, profile);
  if (credKv && Object.keys(credKv).length > 0) {
    upsertSection(creds, 'default', credKv);
    writeDoc(credentialsFile, creds, true);
  }

  const config = readDoc(configFile);
  const cfgKv = getSection(config, configHeader(profile));
  if (cfgKv && Object.keys(cfgKv).length > 0) {
    upsertSection(config, 'default', cfgKv);
    writeDoc(configFile, config);
  }
}
