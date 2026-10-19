import pc from 'picocolors';
import {
  getConfigKeys,
  getCredentialKeys,
  parseSessionExpiration,
  resolveProfileName,
} from '../core/aws-files.js';
import { whoami } from '../core/identity.js';
import { readSsoTokenExpiry } from '../core/sso.js';
import { formatRelative } from '../core/util.js';
import { t } from '../ui/i18n.js';
import { box, emitJson, isJsonMode, spin } from '../ui/output.js';

export interface WhoamiOptions {
  profile?: string;
  json?: boolean;
}

/**
 * How long these credentials last: the recorded expiry for temporary sessions,
 * or the cached SSO token's expiry for SSO profiles. Null for long-lived keys.
 */
async function sessionExpiry(profile: string): Promise<Date | null> {
  const recorded = parseSessionExpiration(await getCredentialKeys(profile));
  if (recorded) return recorded;
  const cfg = await getConfigKeys(profile);
  const ssoKey = cfg.sso_session ?? cfg.sso_start_url;
  return ssoKey ? readSsoTokenExpiry(ssoKey) : null;
}

function sessionLine(expiration: Date): string {
  const label = `${pc.dim(`${t('Session')}:`)}  `;
  return expiration > new Date()
    ? `${label}${pc.green(t('expires in {rel}', { rel: formatRelative(expiration) }))} ${pc.dim(`· ${expiration.toLocaleString()}`)}`
    : `${label}${pc.red(t('expired'))} ${pc.dim(`· ${expiration.toLocaleString()}`)}`;
}

/**
 * Show the active identity: which account, which user/role, which profile.
 * `--json` returns it as data — the identity, never the credentials — so a
 * script or agent can check a session without reading AWS's caches itself.
 */
export async function whoamiCommand(opts: WhoamiOptions = {}): Promise<void> {
  const profile = resolveProfileName(opts.profile);

  const identity = await spin(t('Checking your AWS identity…'), () => whoami(profile));
  const expiration = await sessionExpiry(profile);

  if (isJsonMode()) {
    emitJson({ ...identity, sessionExpiresAt: expiration?.toISOString() ?? null });
    return;
  }

  box(
    [
      `${pc.dim(`${t('Account')}:`)}  ${pc.bold(identity.account)}`,
      `${pc.dim(`${t('Identity')}:`)} ${identity.arn}`,
      `${pc.dim(`${t('User ID')}:`)}  ${pc.dim(identity.userId)}`,
      '',
      `${pc.dim(`${t('Profile')}:`)}  ${pc.yellow(identity.profile)}   ${pc.dim(`${t('Region')}:`)} ${pc.cyan(identity.region)}`,
      ...(expiration ? [sessionLine(expiration)] : []),
    ],
    pc.bold('aws whoami'),
  );
}
