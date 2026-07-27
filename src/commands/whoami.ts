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
import { box, spin } from '../ui/output.js';

export interface WhoamiOptions {
  profile?: string;
}

/**
 * How long these credentials last: the recorded expiry for temporary sessions,
 * or the cached SSO token's expiry for SSO profiles. Null for long-lived keys.
 */
async function sessionLine(profile: string): Promise<string | null> {
  const recorded = parseSessionExpiration(await getCredentialKeys(profile));
  const cfg = await getConfigKeys(profile);
  const ssoKey = cfg.sso_session ?? cfg.sso_start_url;
  const expiration = recorded ?? (ssoKey ? readSsoTokenExpiry(ssoKey) : null);
  if (!expiration) return null;

  const label = `${pc.dim(`${t('Session')}:`)}  `;
  return expiration > new Date()
    ? `${label}${pc.green(t('expires in {rel}', { rel: formatRelative(expiration) }))} ${pc.dim(`· ${expiration.toLocaleString()}`)}`
    : `${label}${pc.red(t('expired'))} ${pc.dim(`· ${expiration.toLocaleString()}`)}`;
}

/** Show the active identity: which account, which user/role, which profile. */
export async function whoamiCommand(opts: WhoamiOptions = {}): Promise<void> {
  const profile = resolveProfileName(opts.profile);

  const identity = await spin(t('Checking your AWS identity…'), () => whoami(profile));
  const session = await sessionLine(profile);

  box(
    [
      `${pc.dim(`${t('Account')}:`)}  ${pc.bold(identity.account)}`,
      `${pc.dim(`${t('Identity')}:`)} ${identity.arn}`,
      `${pc.dim(`${t('User ID')}:`)}  ${pc.dim(identity.userId)}`,
      '',
      `${pc.dim(`${t('Profile')}:`)}  ${pc.yellow(identity.profile)}   ${pc.dim(`${t('Region')}:`)} ${pc.cyan(identity.region)}`,
      ...(session ? [session] : []),
    ],
    pc.bold('aws whoami'),
  );
}
