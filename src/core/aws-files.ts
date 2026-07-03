import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader';

/** Resolved paths to the two AWS shared files (respecting the standard env vars). */
export function awsFilePaths(): { configFile: string; credentialsFile: string } {
  const home = homedir();
  return {
    configFile: process.env.AWS_CONFIG_FILE ?? join(home, '.aws', 'config'),
    credentialsFile: process.env.AWS_SHARED_CREDENTIALS_FILE ?? join(home, '.aws', 'credentials'),
  };
}

export type CredentialKind = 'keys' | 'sso' | 'role' | 'session' | 'unknown';

export interface ProfileInfo {
  name: string;
  region: string | null;
  kind: CredentialKind;
  /** Source of MFA serial when the profile is MFA-protected. */
  mfaSerial: string | null;
  roleArn: string | null;
  sourceProfile: string | null;
  /** True when the profile lives in ~/.aws/credentials (has long-lived keys). */
  hasCredentials: boolean;
}

function classify(merged: Record<string, string | undefined>, hasCredentials: boolean): CredentialKind {
  if (merged.sso_session || merged.sso_start_url || merged.sso_account_id) return 'sso';
  if (merged.role_arn) return 'role';
  if (merged.aws_session_token) return 'session';
  if (merged.aws_access_key_id || hasCredentials) return 'keys';
  return 'unknown';
}

/**
 * List every profile found across ~/.aws/config and ~/.aws/credentials, merged
 * by name. Uses the AWS SDK's loader so the `[profile foo]` vs `[foo]` quirk and
 * other edge cases are handled the same way the real tooling handles them.
 */
export async function listProfiles(): Promise<ProfileInfo[]> {
  const { configFile, credentialsFile } = await loadSharedConfigFiles();
  const names = new Set([...Object.keys(configFile), ...Object.keys(credentialsFile)]);

  const profiles: ProfileInfo[] = [];
  for (const name of names) {
    // [sso-session X] sections are login endpoints, not usable profiles.
    if (name.startsWith('sso-session.')) continue;
    const fromConfig = configFile[name] ?? {};
    const fromCreds = credentialsFile[name] ?? {};
    const merged = { ...fromConfig, ...fromCreds };
    const hasCredentials = Object.keys(fromCreds).length > 0;

    profiles.push({
      name,
      region: merged.region ?? null,
      kind: classify(merged, hasCredentials),
      mfaSerial: merged.mfa_serial ?? null,
      roleArn: merged.role_arn ?? null,
      sourceProfile: merged.source_profile ?? null,
      hasCredentials,
    });
  }

  return profiles.sort((a, b) =>
    a.name === 'default' ? -1 : b.name === 'default' ? 1 : a.name.localeCompare(b.name),
  );
}

/** The profile awswiz should act on by default: --profile flag → AWS_PROFILE → "default". */
export function resolveProfileName(explicit?: string): string {
  return explicit ?? process.env.AWS_PROFILE ?? 'default';
}

export async function getProfile(name: string): Promise<ProfileInfo | undefined> {
  return (await listProfiles()).find((p) => p.name === name);
}

/** The raw config-file keys for a profile (sso_start_url, mfa_serial, region…). */
export async function getConfigKeys(profile: string): Promise<Record<string, string>> {
  const { configFile } = await loadSharedConfigFiles();
  const section = configFile[profile];
  if (!section) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(section)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** The raw keys of an [sso-session <name>] section in ~/.aws/config, or null. */
export async function getSsoSessionKeys(name: string): Promise<Record<string, string> | null> {
  const keys = await getConfigKeys(`sso-session.${name}`);
  return Object.keys(keys).length > 0 ? keys : null;
}

/** Names of profiles that can SSO-login (they have sso_session or sso_start_url). */
export async function listSsoProfiles(): Promise<string[]> {
  const { configFile } = await loadSharedConfigFiles();
  return Object.keys(configFile)
    .filter((name) => !name.startsWith('sso-session.'))
    .filter((name) => configFile[name]?.sso_session || configFile[name]?.sso_start_url);
}

/** Resolve the effective region for a profile: profile → env → fallback. */
export async function resolveRegion(profile: string, fallback = 'us-east-1'): Promise<string> {
  const { configFile, credentialsFile } = await loadSharedConfigFiles();
  return (
    configFile[profile]?.region ??
    credentialsFile[profile]?.region ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    fallback
  );
}
