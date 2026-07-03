import pc from 'picocolors';
import {
  getConfigKeys,
  getCredentialKeys,
  listProfiles,
  listSsoProfiles,
  parseSessionExpiration,
} from '../core/aws-files.js';
import { readSsoTokenExpiry } from '../core/sso.js';
import { formatRelative } from '../core/util.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';

/**
 * The "where am I" of AWS credentials: which temporary sessions are alive,
 * which SSO tokens are still valid, and what profile is active — with the
 * renewal command right next to anything that expired. Read-only and CI-safe.
 */
export async function statusCommand(): Promise<void> {
  const profiles = await listProfiles();
  const sessions = profiles.filter((p) => p.kind === 'session');
  const ssoProfiles = await listSsoProfiles();
  const now = new Date();

  log.blank();

  // Temporary sessions (MFA / assumed roles).
  log.info(pc.bold(`  ${t('Temporary sessions:')}`));
  if (sessions.length === 0) {
    log.dim(`    ${t('none — start one with "awswiz mfa" or "awswiz assume"')}`);
  } else {
    const width = Math.max(...sessions.map((p) => p.name.length));
    for (const p of sessions) {
      const expiration = parseSessionExpiration(await getCredentialKeys(p.name));
      let detail: string;
      if (!expiration) {
        detail = pc.dim(`? ${t('no expiry recorded')}`);
      } else if (expiration > now) {
        detail = pc.green(`✔ ${t('expires in {rel}', { rel: formatRelative(expiration) })}`);
      } else {
        const base = p.name.replace(/-mfa$/, '');
        const renewable = base !== p.name && profiles.some((x) => x.name === base);
        detail = `${pc.red(`✖ ${t('expired')}`)}${renewable ? `   ${pc.dim(`→ awswiz mfa -p ${base}`)}` : ''}`;
      }
      log.info(`    ${pc.bold(p.name.padEnd(width))}  ${detail}`);
    }
  }
  log.blank();

  // SSO tokens.
  if (ssoProfiles.length > 0) {
    log.info(pc.bold(`  ${t('SSO sessions:')}`));
    const width = Math.max(...ssoProfiles.map((n) => n.length));
    for (const name of ssoProfiles) {
      const cfg = await getConfigKeys(name);
      const keySource = cfg.sso_session ?? cfg.sso_start_url;
      const expiration = keySource ? readSsoTokenExpiry(keySource) : null;
      const detail =
        expiration && expiration > now
          ? pc.green(`✔ ${t('signed in — {rel} left', { rel: formatRelative(expiration) })}`)
          : `${pc.red(`✖ ${t('not signed in')}`)}   ${pc.dim(`→ awswiz login -p ${name}`)}`;
      log.info(`    ${pc.bold(name.padEnd(width))}  ${detail}`);
    }
    log.blank();
  }

  const active = process.env.AWS_PROFILE;
  log.info(
    `  ${t('Active profile')}: ${pc.yellow(active ?? 'default')}${active ? '' : pc.dim(` ${t('(AWS_PROFILE not set)')}`)}`,
  );
  log.blank();
}
