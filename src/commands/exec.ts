import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { getCredentialKeys, getProfile, listProfiles, parseSessionExpiration } from '../core/aws-files.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, confirm, select } from '../ui/prompts.js';

export interface ExecOptions {
  profile?: string;
}

const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/**
 * An expired session is a dead end for the command about to run, so offer to
 * renew it right here instead of letting AWS fail with a cryptic ExpiredToken.
 * Only `<base>-mfa` profiles can be renewed unattended-ish (base profile + a code).
 */
async function ensureFreshSession(profile: string): Promise<void> {
  const expiration = parseSessionExpiration(await getCredentialKeys(profile));
  if (!expiration || expiration > new Date()) return;

  const base = profile.replace(/-mfa$/, '');
  const renewable = base !== profile && (await getProfile(base)) !== undefined;

  if (!renewable || !isInteractive()) {
    log.warn(t('The "{profile}" session is expired — the command will likely fail.', { profile }));
    if (renewable) log.dim(`  ${t('Renew it first: awswiz mfa -p {base}', { base })}`);
    return;
  }

  log.warn(t('The "{profile}" session expired.', { profile }));
  const renew = await confirm({ message: t('Renew it now with MFA?'), default: true });
  if (!renew) {
    log.dim(t('Continuing with the expired session — the command will likely fail.'));
    return;
  }

  const { mfaCommand } = await import('./mfa.js');
  await mfaCommand({ profile: base });
  log.blank();
}

/**
 * Run any command with a profile's credentials by setting AWS_PROFILE for the
 * child process — no shell exports, no copy/paste. `awswiz exec -p prod -- terraform plan`
 */
export async function execCommand(command: string[], opts: ExecOptions = {}): Promise<void> {
  if (command.length === 0) {
    throw new AwswizError(t('No command given.'), {
      hint: t('Example: awswiz exec -p prod -- aws s3 ls'),
    });
  }

  let profile = opts.profile;
  if (!profile) {
    assertInteractive();
    const profiles = await listProfiles();
    profile = await select({
      message: t('Which profile should the command run with?'),
      choices: profiles.map((p) => ({ name: `${pc.bold(p.name)}  ${pc.dim(p.region ?? '')}`, value: p.name })),
    });
  }

  await ensureFreshSession(profile);

  log.dim(`  AWS_PROFILE=${profile} ${command.join(' ')}`);
  log.blank();

  const env = { ...process.env, AWS_PROFILE: profile };
  let result = spawnSync(command[0]!, command.slice(1), { stdio: 'inherit', env });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT' && process.platform === 'win32') {
    // Windows: .cmd/.bat shims (npx, serverless, …) need a shell to resolve.
    result = spawnSync(command.join(' '), { stdio: 'inherit', env, shell: true });
  }
  if (result.error) {
    throw new AwswizError(t('Could not run "{cmd}": {err}', { cmd: command[0]!, err: result.error.message }));
  }
  process.exitCode = result.status ?? 1;
}
