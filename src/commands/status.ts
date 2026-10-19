import pc from 'picocolors';
import {
  getConfigKeys,
  getCredentialKeys,
  listProfiles,
  listSsoProfiles,
  parseSessionExpiration,
} from '../core/aws-files.js';
import { ssoSessionState, readSsoTokenExpiry, type SsoSessionState } from '../core/sso.js';
import { formatRelative } from '../core/util.js';
import { t } from '../ui/i18n.js';
import { emitJson, isJsonMode, log } from '../ui/output.js';

export interface SessionStatus {
  profile: string;
  /** ISO time the temporary credentials stop working, or null when not recorded. */
  expiresAt: string | null;
  state: 'valid' | 'expired' | 'unknown';
  /** The command that renews it, when awswiz knows one. */
  renew: string | null;
}

export interface SsoStatus {
  profile: string;
  /** The [sso-session] name, or null for a legacy start-URL profile. */
  ssoSession: string | null;
  /** ISO expiry of the cached access token, or null when never signed in. */
  expiresAt: string | null;
  /** 'refreshable': the token expired but the SDK renews it silently. */
  state: SsoSessionState;
  renew: string | null;
}

export interface StatusReport {
  activeProfile: string;
  sessions: SessionStatus[];
  sso: SsoStatus[];
}

/** Everything `status` shows, as data. Never includes keys or tokens. */
export async function collectStatus(now = new Date()): Promise<StatusReport> {
  const profiles = await listProfiles();
  const sessions: SessionStatus[] = [];
  for (const p of profiles.filter((x) => x.kind === 'session')) {
    const expiration = parseSessionExpiration(await getCredentialKeys(p.name));
    const base = p.name.replace(/-mfa$/, '');
    const renewable = base !== p.name && profiles.some((x) => x.name === base);
    const state = !expiration ? 'unknown' : expiration > now ? 'valid' : 'expired';
    sessions.push({
      profile: p.name,
      expiresAt: expiration?.toISOString() ?? null,
      state,
      renew: renewable && state !== 'valid' ? `awswiz mfa -p ${base}` : null,
    });
  }

  const sso: SsoStatus[] = [];
  for (const name of await listSsoProfiles()) {
    const cfg = await getConfigKeys(name);
    const keySource = cfg.sso_session ?? cfg.sso_start_url;
    const state: SsoSessionState = keySource ? ssoSessionState(keySource, now.getTime()) : 'missing';
    const expiration = keySource ? readSsoTokenExpiry(keySource) : null;
    sso.push({
      profile: name,
      ssoSession: cfg.sso_session ?? null,
      expiresAt: expiration?.toISOString() ?? null,
      state,
      renew: state === 'expired' || state === 'missing' ? `awswiz login -p ${name}` : null,
    });
  }

  return { activeProfile: process.env.AWS_PROFILE ?? 'default', sessions, sso };
}

/**
 * The "where am I" of AWS credentials: which temporary sessions are alive,
 * which SSO tokens are still valid, and what profile is active — with the
 * renewal command right next to anything that expired. Read-only and CI-safe;
 * `--json` gives the same as data (no secrets), for scripts and agents.
 */
export async function statusCommand(): Promise<void> {
  const report = await collectStatus();
  if (isJsonMode()) {
    emitJson(report);
    return;
  }

  log.blank();

  // Temporary sessions (MFA / assumed roles).
  log.info(pc.bold(`  ${t('Temporary sessions:')}`));
  if (report.sessions.length === 0) {
    log.dim(`    ${t('none — start one with "awswiz mfa" or "awswiz assume"')}`);
  } else {
    const width = Math.max(...report.sessions.map((s) => s.profile.length));
    for (const s of report.sessions) {
      let detail: string;
      if (s.state === 'unknown') {
        detail = pc.dim(`? ${t('no expiry recorded')}`);
      } else if (s.state === 'valid') {
        detail = pc.green(`✔ ${t('expires in {rel}', { rel: formatRelative(new Date(s.expiresAt!)) })}`);
      } else {
        detail = `${pc.red(`✖ ${t('expired')}`)}${s.renew ? `   ${pc.dim(`→ ${s.renew}`)}` : ''}`;
      }
      log.info(`    ${pc.bold(s.profile.padEnd(width))}  ${detail}`);
    }
  }
  log.blank();

  // SSO tokens.
  if (report.sso.length > 0) {
    log.info(pc.bold(`  ${t('SSO sessions:')}`));
    const width = Math.max(...report.sso.map((s) => s.profile.length));
    for (const s of report.sso) {
      const detail =
        s.state === 'valid'
          ? pc.green(`✔ ${t('signed in — {rel} left', { rel: formatRelative(new Date(s.expiresAt!)) })}`)
          : s.state === 'refreshable'
            ? pc.green(`✔ ${t('signed in — renews automatically')}`)
            : `${pc.red(`✖ ${t('not signed in')}`)}   ${pc.dim(`→ ${s.renew}`)}`;
      log.info(`    ${pc.bold(s.profile.padEnd(width))}  ${detail}`);
    }
    log.blank();
  }

  const active = process.env.AWS_PROFILE;
  log.info(
    `  ${t('Active profile')}: ${pc.yellow(report.activeProfile)}${active ? '' : pc.dim(` ${t('(AWS_PROFILE not set)')}`)}`,
  );
  log.blank();
}
