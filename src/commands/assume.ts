import pc from 'picocolors';
import { getProfile, listProfiles, resolveRegion } from '../core/aws-files.js';
import { writeConfigProfile, writeCredentials } from '../core/aws-writer.js';
import { assumeRole } from '../core/sts.js';
import { formatRelative } from '../core/util.js';
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

  // 1. Source profile (whose credentials make the AssumeRole call).
  let source: string;
  if (opts.profile) {
    source = opts.profile;
  } else {
    assertInteractive();
    const candidates = (await listProfiles()).filter((p) => p.hasCredentials || p.kind === 'session');
    source = await select({
      message: t('Which profile should assume the role (the source)?'),
      choices: candidates.map((p) => ({ name: `${pc.bold(p.name)}  ${pc.dim(p.region ?? '')}`, value: p.name })),
    });
  }
  const sourceInfo = await getProfile(source);

  // 2. Role ARN.
  let roleArn = opts.role ?? sourceInfo?.roleArn ?? undefined;
  if (!roleArn) {
    if (nonInteractive) throw new AwswizError(t('No role ARN given.'), { hint: t('Pass --role arn:aws:iam::…:role/Name.') });
    assertInteractive();
    roleArn = await input({
      message: t('Role ARN to assume:'),
      placeholder: 'arn:aws:iam::123456789012:role/MyRole',
      validate: (v) => (v.trim().startsWith('arn:aws:iam::') ? true : t('Should look like arn:aws:iam::<account>:role/<name>')),
    });
  }

  const sessionName = opts.sessionName ?? `awswiz-${Date.now()}`;
  const region = await resolveRegion(source);

  // 3. Optional MFA (when the source profile or role requires it).
  const serial = opts.serial ?? sourceInfo?.mfaSerial ?? undefined;
  let code = opts.code;
  if (serial && !code) {
    if (nonInteractive) throw new AwswizError(t('This source requires MFA.'), { hint: t('Pass --code <6 digits>.') });
    assertInteractive();
    code = await input({
      message: t('MFA code (this role needs MFA):'),
      validate: (v) => (/^\d{6}$/.test(v.trim()) ? true : t('The code is 6 digits.')),
    });
  }

  // 4. AssumeRole.
  const creds = await spin(t('Assuming the role…'), () =>
    assumeRole({
      sourceProfile: source,
      region,
      roleArn: roleArn!,
      sessionName,
      serialNumber: serial,
      tokenCode: code?.trim(),
      durationSeconds: opts.duration ? Number(opts.duration) : undefined,
    }),
  );

  // 5. Store the temporary credentials as a target profile.
  let target = opts.target ?? roleArn.split('/').pop()?.toLowerCase() ?? 'assumed';
  if (!opts.target && !nonInteractive) {
    target = await input({ message: t('Save the temporary credentials as which profile?'), default: target });
  }
  writeCredentials(target, {
    aws_access_key_id: creds.accessKeyId,
    aws_secret_access_key: creds.secretAccessKey,
    aws_session_token: creds.sessionToken,
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
