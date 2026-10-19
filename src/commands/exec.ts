import crossSpawn from 'cross-spawn';
import pc from 'picocolors';
import { getConfigKeys, getCredentialKeys, getProfile, listProfiles, parseSessionExpiration } from '../core/aws-files.js';
import { ssoSessionState } from '../core/sso.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, confirm, select } from '../ui/prompts.js';

export interface ExecOptions {
  profile?: string;
}

const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** What would keep a profile's credentials from working, and the command that fixes it. */
async function deadSession(profile: string): Promise<{ renew: string; mfaBase?: string; sso?: boolean } | null> {
  const expiration = parseSessionExpiration(await getCredentialKeys(profile));
  if (expiration && expiration <= new Date()) {
    const base = profile.replace(/-mfa$/, '');
    if (base !== profile && (await getProfile(base))) return { renew: `awswiz mfa -p ${base}`, mfaBase: base };
    return { renew: `awswiz assume --target ${profile}` };
  }
  const cfg = await getConfigKeys(profile);
  const ssoKey = cfg.sso_session ?? cfg.sso_start_url;
  if (ssoKey && ['expired', 'missing'].includes(ssoSessionState(ssoKey))) {
    return { renew: `awswiz login -p ${profile}`, sso: true };
  }
  return null;
}

/**
 * A dead session is a dead end for the command about to run. In a terminal,
 * offer to renew it right here; without one (scripts, agents) stop before the
 * command starts, instead of letting it fail halfway with a cryptic ExpiredToken.
 */
async function ensureFreshSession(profile: string): Promise<void> {
  const dead = await deadSession(profile);
  if (!dead) return;

  if (!isInteractive()) {
    throw new AwswizError(t('The "{profile}" session is expired, so the command would fail.', { profile }), {
      hint: t('Renew it first: {cmd}', { cmd: dead.renew }),
    });
  }

  log.warn(t('The "{profile}" session expired.', { profile }));
  const renew = await confirm({
    message: dead.sso ? t('Sign in again now?') : dead.mfaBase ? t('Renew it now with MFA?') : t('Continue anyway?'),
    default: true,
  });
  if (!dead.sso && !dead.mfaBase) {
    if (!renew) throw new AwswizError(t('Cancelled.'), { hint: t('Renew it first: {cmd}', { cmd: dead.renew }) });
    return;
  }
  if (!renew) {
    log.dim(t('Continuing with the expired session — the command will likely fail.'));
    return;
  }
  if (dead.sso) {
    const { loginCommand } = await import('./login.js');
    await loginCommand({ profile });
  } else {
    const { mfaCommand } = await import('./mfa.js');
    await mfaCommand({ profile: dead.mfaBase });
  }
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
  if (!(await getProfile(profile))) {
    throw new AwswizError(t('Profile "{profile}" not found.', { profile }), {
      hint: t('See your profiles with: awswiz profile list'),
    });
  }

  await ensureFreshSession(profile);

  // stderr, not stdout: the child's output is the useful data — piping
  // `awswiz exec -- aws … --output json` into jq must get only the JSON.
  console.error(pc.dim(`  AWS_PROFILE=${profile} ${command.join(' ')}`));

  const env = { ...process.env, AWS_PROFILE: profile };
  // cross-spawn resolves .cmd/.bat shims (npx, cdk, serverless…) on Windows and
  // quotes every argument for cmd.exe. The old fallback joined the arguments
  // with spaces into a shell line: "my file.txt" split in two, and a "&" in an
  // argument ran as a second command.
  const result = crossSpawn.sync(command[0]!, command.slice(1), { stdio: 'inherit', env });
  if (result.error) {
    throw new AwswizError(t('Could not run "{cmd}": {err}', { cmd: command[0]!, err: result.error.message }), {
      hint: (result.error as NodeJS.ErrnoException).code === 'ENOENT' ? t('Is it installed and on your PATH?') : undefined,
    });
  }
  process.exitCode = result.status ?? 1;
}
