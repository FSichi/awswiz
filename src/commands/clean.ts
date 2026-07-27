import pc from 'picocolors';
import { getCredentialKeys, listProfiles, parseSessionExpiration } from '../core/aws-files.js';
import { removeProfile } from '../core/aws-writer.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, checkbox, confirm } from '../ui/prompts.js';

export interface CleanOptions {
  yes?: boolean;
}

interface DeadSession {
  name: string;
  expiration: Date | null;
}

/**
 * Temporary session profiles pile up (`prod-mfa`, `admin-role`, …) long after
 * they stop working. Clean removes the dead ones — and *only* those: profiles
 * with long-lived keys, SSO or role configuration are never touched.
 */
export async function cleanCommand(opts: CleanOptions = {}): Promise<void> {
  const now = new Date();
  const sessions = (await listProfiles()).filter((p) => p.kind === 'session');

  const expired: DeadSession[] = [];
  const unknown: DeadSession[] = [];
  const alive: DeadSession[] = [];

  for (const profile of sessions) {
    const expiration = parseSessionExpiration(await getCredentialKeys(profile.name));
    const entry = { name: profile.name, expiration };
    if (!expiration) unknown.push(entry);
    else if (expiration < now) expired.push(entry);
    else alive.push(entry);
  }

  log.blank();
  if (expired.length === 0 && unknown.length === 0) {
    log.success(
      alive.length > 0
        ? t('Nothing to clean — all {n} session(s) are still valid.', { n: alive.length })
        : t('Nothing to clean — no temporary session profiles found.'),
    );
    log.blank();
    return;
  }

  // Non-interactive: only remove what is provably expired.
  if (opts.yes) {
    if (expired.length === 0) {
      log.success(t('Nothing to clean — no expired sessions found.'));
      log.dim(`  ${t('{n} session(s) have no recorded expiry; run "awswiz clean" to review them.', { n: unknown.length })}`);
      log.blank();
      return;
    }
    for (const entry of expired) removeProfile(entry.name);
    log.success(t('Removed {n} expired session profile(s).', { n: expired.length }));
    log.blank();
    return;
  }

  assertInteractive();

  const choices = [
    ...expired.map((e) => ({
      name: `${pc.bold(e.name)}  ${pc.red(t('expired'))} ${pc.dim(`· ${e.expiration!.toLocaleString()}`)}`,
      value: e.name,
      checked: true,
    })),
    ...unknown.map((e) => ({
      name: `${pc.bold(e.name)}  ${pc.dim(t('no expiry recorded — may still work'))}`,
      value: e.name,
      checked: false,
    })),
  ];

  const selected = await checkbox({
    message: t('Which session profiles should be removed from ~/.aws?'),
    choices,
  });

  if (selected.length === 0) {
    log.dim(t('Nothing selected.'));
    return;
  }
  if (alive.length > 0) {
    log.dim(`  ${t('Keeping {n} valid session(s): {names}', { n: alive.length, names: alive.map((a) => a.name).join(', ') })}`);
  }

  const sure = await confirm({
    message: t('Remove {n} profile(s)? This edits ~/.aws and cannot be undone.', { n: selected.length }),
    default: false,
  });
  if (!sure) {
    log.dim(t('Nothing changed.'));
    return;
  }

  for (const name of selected) removeProfile(name);
  log.blank();
  log.success(t('Removed {n} session profile(s).', { n: selected.length }));
  log.dim(`  ${t('Start a fresh one with "awswiz mfa" whenever you need it.')}`);
  log.blank();
}
