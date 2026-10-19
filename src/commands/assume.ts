import pc from 'picocolors';
import { assertSessionTarget, listProfiles, resolveRegion } from '../core/aws-files.js';
import { replaceCredentials, writeConfigProfile } from '../core/aws-writer.js';
import { assumeRole } from '../core/sts.js';
import { formatRelative, parseDuration, parseMfaCode } from '../core/util.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, log, spin } from '../ui/output.js';
import { assertInteractive, input, select } from '../ui/prompts.js';

export interface AssumeOptions {
  profile?: string;
  role?: string;
  sessionName?: string;
  target?: string;
  code?: string;
  serial?: string;
  duration?: string;
}

/** Assume an IAM role (cross-account) and store the temporary credentials as a profile. */
export async function assumeCommand(opts: AssumeOptions = {}): Promise<void> {
  const nonInteractive = Boolean(opts.profile && opts.role);
  // Bad flags fail here, before an MFA code is spent on a request that cannot work.
  const durationSeconds = parseDuration(opts.duration);
  const flagCode = opts.code !== undefined ? parseMfaCode(opts.code) : undefined;
  const profiles = await listProfiles();

  // 1. Source profile (whose credentials make the AssumeRole call). SSO and role
  // profiles resolve credentials too, so they can be sources.
  let source: string;
  if (opts.profile) {
    source = opts.profile;
  } else {
    assertInteractive();
    const candidates = profiles.filter((p) => p.hasCredentials || p.kind !== 'unknown');
    source = await select({
      message: t('Which profile should assume the role (the source)?'),
      choices: candidates.map((p) => ({ name: `${pc.bold(p.name)}  ${pc.dim(p.region ?? '')}`, value: p.name })),
    });
  }
  const sourceInfo = profiles.find((p) => p.name === source);
  if (!sourceInfo) {
    throw new AwswizError(t('Profile "{profile}" not found.', { profile: source }), {
      hint: t('See your profiles with: awswiz profile list'),
    });
  }

  // 2. Role ARN.
  let roleArn = opts.role ?? sourceInfo.roleArn ?? undefined;
  if (!roleArn) {
    if (nonInteractive) throw new AwswizError(t('No role ARN given.'), { hint: t('Pass --role arn:aws:iam::…:role/Name.') });
    assertInteractive();
    roleArn = await input({
      message: t('Role ARN to assume:'),
      placeholder: 'arn:aws:iam::123456789012:role/MyRole',
      validate: (v) => (v.trim().startsWith('arn:aws:iam::') ? true : t('Should look like arn:aws:iam::<account>:role/<name>')),
    });
  }
  // A role profile's own role is assumed with its source_profile's credentials;
  // using the role profile itself would assume the role from inside the role.
  const caller = !opts.role && sourceInfo.kind === 'role' && sourceInfo.sourceProfile ? sourceInfo.sourceProfile : source;

  // 3. Where the credentials go — settled before calling AWS, so a name that
  // would overwrite a real profile fails before the MFA code is used.
  let target = opts.target ?? roleArn.split('/').pop()?.toLowerCase() ?? 'assumed';
  if (!opts.target && !nonInteractive) {
    const clash = (name: string) => {
      const existing = profiles.find((p) => p.name === name.trim());
      return existing && existing.kind !== 'session' && existing.kind !== 'unknown';
    };
    target = (
      await input({
        message: t('Save the temporary credentials as which profile?'),
        default: clash(target) ? `${target}-session` : target,
        validate: (v) => (clash(v) ? t('That profile has its own credentials — pick another name.') : true),
      })
    ).trim();
  }
  await assertSessionTarget(target);

  const sessionName = opts.sessionName ?? `awswiz-${Date.now()}`;
  const region = await resolveRegion(source);

  // 4. Optional MFA (when the source profile or role requires it).
  const serial = opts.serial ?? sourceInfo.mfaSerial ?? undefined;
  let code = flagCode;
  if (serial && !code) {
    if (nonInteractive) throw new AwswizError(t('This source requires MFA.'), { hint: t('Pass --code <6 digits>.') });
    assertInteractive();
    code = await input({
      message: t('MFA code (this role needs MFA):'),
      validate: (v) => (/^\d{6}$/.test(v.trim()) ? true : t('The code is 6 digits.')),
    });
  }

  // 5. AssumeRole.
  const creds = await spin(t('Assuming the role…'), () =>
    assumeRole({
      sourceProfile: caller,
      region,
      roleArn: roleArn!,
      sessionName,
      serialNumber: serial,
      tokenCode: code?.trim(),
      durationSeconds,
    }),
  );

  // 6. Store the temporary credentials — a whole new session, nothing old kept.
  replaceCredentials(target, {
    aws_access_key_id: creds.accessKeyId,
    aws_secret_access_key: creds.secretAccessKey,
    aws_session_token: creds.sessionToken,
    // Recorded so "awswiz status" can show when this session dies.
    aws_session_expiration: creds.expiration.toISOString(),
  });
  if (region) writeConfigProfile(target, { region });

  box(
    [
      `${pc.dim(`${t('Profile')}:`)}  ${pc.yellow(target)}`,
      `${pc.dim(`${t('Role')}:`)}     ${roleArn}`,
      `${pc.dim(`${t('Expires')}:`)}  ${creds.expiration.toLocaleString()}  ${pc.dim(`(${t('in')} ${formatRelative(creds.expiration)})`)}`,
    ],
    pc.bold(`✔ ${t('Role assumed')}`),
  );
  log.blank();
}
