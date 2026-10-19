import pc from 'picocolors';
import {
  getConfigKeys,
  getCredentialKeys,
  getSsoSessionKeys,
  listProfiles,
  listSsoProfiles,
  parseSessionExpiration,
} from '../core/aws-files.js';
import {
  cachedSsoTarget,
  readSsoTokenExpiry,
  refreshSsoToken,
  ssoSessionState,
  ssoTokenRenewable,
  type RefreshOutcome,
  type SsoSessionState,
} from '../core/sso.js';
import { readSsoSignIn } from '../core/sso-sign-ins.js';
import { formatClock, formatElapsed, formatRelative, parseSessionDuration } from '../core/util.js';
import { t } from '../ui/i18n.js';
import { emitJson, isJsonMode, log, spin } from '../ui/output.js';

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
  /**
   * valid: signed in (checked with Identity Center when the token had expired);
   * expired: the session ended; missing: never signed in; unverified: Identity
   * Center could not be reached; refreshable: not checked (--offline).
   */
  state: SsoSessionState;
  /** ISO expiry of the cached 1-hour access token (renewed while the session lasts). */
  expiresAt: string | null;
  /** ISO time of the last full sign-in through awswiz, or null when unknown. */
  signedInAt: string | null;
  /**
   * ISO end of the Identity Center session, when it can be known: exact for a
   * token that cannot be renewed (it lasts the whole session), estimated from
   * awswiz_session_duration in the config otherwise. AWS never reports it.
   */
  sessionEndsAt: string | null;
  sessionEndSource: 'token' | 'config' | null;
  renew: string | null;
}

export interface StatusReport {
  activeProfile: string;
  sessions: SessionStatus[];
  sso: SsoStatus[];
}

export interface StatusOptions {
  /** Skip asking Identity Center about expired tokens (no network). */
  offline?: boolean;
  json?: boolean;
}

/** Everything `status` shows, as data. Never includes keys or tokens. */
export async function collectStatus(opts: { now?: Date; verify?: boolean } = {}): Promise<StatusReport> {
  const now = opts.now ?? new Date();
  const verify = opts.verify ?? true;
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

  // An expired-but-refreshable token says nothing about the session: ask
  // Identity Center, once per session even when several profiles share it.
  const checks = new Map<string, Promise<RefreshOutcome>>();
  const check = (keySource: string, sessionName: string | null): Promise<RefreshOutcome> => {
    let pending = checks.get(keySource);
    if (!pending) {
      const target = cachedSsoTarget(keySource, sessionName);
      pending = target ? refreshSsoToken(target) : Promise.resolve({ state: 'unverified' } as const);
      checks.set(keySource, pending);
    }
    return pending;
  };

  const sso = await Promise.all(
    (await listSsoProfiles()).map(async (name): Promise<SsoStatus> => {
      const cfg = await getConfigKeys(name);
      const sessionName = cfg.sso_session ?? null;
      const keySource = cfg.sso_session ?? cfg.sso_start_url;
      let state: SsoSessionState = keySource ? ssoSessionState(keySource, now.getTime()) : 'missing';
      let expiration = keySource ? readSsoTokenExpiry(keySource) : null;

      if (keySource && state === 'refreshable' && verify) {
        const outcome = await check(keySource, sessionName);
        if (outcome.state === 'renewed') {
          state = 'valid';
          expiration = outcome.expiresAt;
        } else {
          state = outcome.state === 'ended' ? 'expired' : 'unverified';
        }
      }

      const signedIn = keySource ? readSsoSignIn(keySource) : null;
      let sessionEnd: Date | null = null;
      let sessionEndSource: SsoStatus['sessionEndSource'] = null;
      if (keySource && expiration && !ssoTokenRenewable(keySource)) {
        sessionEnd = expiration; // a legacy token lasts exactly the session
        sessionEndSource = 'token';
      } else if (signedIn) {
        const settings = sessionName ? ((await getSsoSessionKeys(sessionName)) ?? {}) : cfg;
        const duration = parseSessionDuration(settings.awswiz_session_duration);
        const estimate = duration ? new Date(signedIn.getTime() + duration) : null;
        // A session that is verifiably alive past the estimate proves it wrong.
        if (estimate && !(state === 'valid' && estimate <= now)) {
          sessionEnd = estimate;
          sessionEndSource = 'config';
        }
      }

      return {
        profile: name,
        ssoSession: sessionName,
        state,
        expiresAt: expiration?.toISOString() ?? null,
        signedInAt: signedIn?.toISOString() ?? null,
        sessionEndsAt: sessionEnd?.toISOString() ?? null,
        sessionEndSource,
        renew: state === 'expired' || state === 'missing' ? `awswiz login -p ${name}` : null,
      };
    }),
  );

  return { activeProfile: process.env.AWS_PROFILE ?? 'default', sessions, sso };
}

/** The human line for one SSO session. */
function ssoDetail(s: SsoStatus, now: Date): string {
  if (s.state === 'expired' || s.state === 'missing') {
    const label = s.state === 'expired' ? t('session ended') : t('not signed in');
    return `${pc.red(`✖ ${label}`)}   ${pc.dim(`→ ${s.renew}`)}`;
  }
  if (s.state === 'unverified' || s.state === 'refreshable') {
    const why = s.state === 'unverified' ? t('could not reach AWS to check the session') : t('not checked (--offline)');
    return `${pc.yellow(`? ${why}`)}   ${pc.dim(`→ ${t('if it fails')}: awswiz login -p ${s.profile}`)}`;
  }

  const parts = [pc.green(`✔ ${t('signed in')}`)];
  if (s.signedInAt) parts.push(pc.dim(t('started {ago} ago', { ago: formatElapsed(new Date(s.signedInAt), now.getTime()) })));
  if (s.sessionEndsAt) {
    const end = new Date(s.sessionEndsAt);
    const estimated = s.sessionEndSource === 'config'; // from the configured length, so approximate
    const clock = `${estimated ? '~' : ''}${formatClock(end, now)}`;
    parts.push(t('ends {clock} (in {rel})', { clock, rel: formatRelative(end) }));
  }
  return parts.join(pc.dim(' · '));
}

/**
 * The "where am I" of AWS credentials: which temporary sessions are alive,
 * which SSO sessions still work, and what profile is active — with the
 * renewal command right next to anything that expired. `--json` gives the same
 * as data (no secrets), for scripts and agents. An SSO token that expired is
 * checked with Identity Center (renewing it, as the SDK would on the next call);
 * `--offline` skips that.
 */
export async function statusCommand(opts: StatusOptions = {}): Promise<void> {
  const verify = !opts.offline;
  const report = await spin(t('Checking your sessions…'), () => collectStatus({ verify }));
  if (isJsonMode()) {
    emitJson(report);
    return;
  }
  const now = new Date();

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

  // SSO sessions.
  if (report.sso.length > 0) {
    log.info(pc.bold(`  ${t('SSO sessions:')}`));
    const width = Math.max(...report.sso.map((s) => s.profile.length));
    for (const s of report.sso) log.info(`    ${pc.bold(s.profile.padEnd(width))}  ${ssoDetail(s, now)}`);
    // Without a configured duration the end cannot be shown — say how to get it.
    if (report.sso.some((s) => s.state === 'valid' && !s.sessionEndsAt)) {
      const hint = t(
        "AWS does not report when an SSO session ends. To see it, add your organization's session length to the [sso-session] section (e.g. awswiz_session_duration = 8h) and sign in with awswiz login.",
      );
      log.dim(`    ${hint}`);
    }
    log.blank();
  }

  const active = process.env.AWS_PROFILE;
  log.info(
    `  ${t('Active profile')}: ${pc.yellow(report.activeProfile)}${active ? '' : pc.dim(` ${t('(AWS_PROFILE not set)')}`)}`,
  );
  log.blank();
}
