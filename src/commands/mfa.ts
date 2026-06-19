import pc from 'picocolors';
import { getProfile, listProfiles, resolveRegion } from '../core/aws-files.js';
import { writeConfigProfile, writeCredentials } from '../core/aws-writer.js';
import { discoverMfaDevices } from '../core/mfa-devices.js';
import { getSessionToken } from '../core/sts.js';
import { formatRelative } from '../core/util.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, log, spin } from '../ui/output.js';
import { assertInteractive, confirm, input, select } from '../ui/prompts.js';

export interface MfaOptions {
  profile?: string;
  code?: string;
  serial?: string;
  duration?: string;
}

/** Exchange a profile's keys + an MFA code for a temporary "<profile>-mfa" session. */
export async function mfaCommand(opts: MfaOptions = {}): Promise<void> {
  const nonInteractive = Boolean(opts.profile && opts.code);

  // 1. The base profile (must have long-lived keys).
  let profileName: string;
  if (opts.profile) {
    profileName = opts.profile;
  } else {
    assertInteractive();
    const candidates = (await listProfiles()).filter(
      (p) => p.kind === 'keys' && !p.name.endsWith('-mfa'),
    );
    if (candidates.length === 0) {
      throw new AwswizError(t('No profiles with long-lived keys found to MFA-protect.'), {
        hint: t('Add one with "awswiz profile add".'),
      });
    }
    profileName = await select({
      message: t('Which profile do you want an MFA session for?'),
      choices: candidates.map((p) => ({ name: `${pc.bold(p.name)}  ${pc.dim(p.region ?? '')}`, value: p.name })),
    });
  }

  const profile = await getProfile(profileName);
  if (!profile) throw new AwswizError(t('Profile "{profile}" not found.', { profile: profileName }));

  const region = await resolveRegion(profileName);

  // 2. MFA serial (device ARN): flag → profile config → auto-discover via IAM → ask.
  let serial = opts.serial ?? profile.mfaSerial ?? undefined;
  if (!serial) {
    let discovered: string[] = [];
    try {
      discovered = await spin(t('Discovering your MFA device…'), () => discoverMfaDevices(profileName, region));
    } catch {
      // The profile may lack iam:ListMFADevices — fall back to asking below.
    }

    if (discovered.length === 1) {
      serial = discovered[0];
      log.dim(`  ${t('MFA device')}: ${serial}`);
    } else if (discovered.length > 1) {
      if (nonInteractive) {
        throw new AwswizError(t('You have several MFA devices.'), { hint: t('Pass --serial <arn> to choose one.') });
      }
      assertInteractive();
      serial = await select({
        message: t('You have several MFA devices — which one?'),
        choices: discovered.map((s) => ({ name: s, value: s })),
      });
    } else {
      if (nonInteractive) {
        throw new AwswizError(t('No MFA serial for "{profile}".', { profile: profileName }), {
          hint: t('Pass --serial arn:aws:iam::…:mfa/you, or add mfa_serial to the profile.'),
        });
      }
      assertInteractive();
      serial = await input({
        message: t('Your MFA device ARN (mfa_serial):'),
        placeholder: 'arn:aws:iam::123456789012:mfa/your-user',
        validate: (v) => (v.trim().startsWith('arn:aws:iam::') ? true : t('Should look like arn:aws:iam::<account>:mfa/<name>')),
      });
      const save = await confirm({
        message: t('Save this MFA serial to the {profile} profile for next time?', { profile: profileName }),
        default: true,
      });
      if (save) writeConfigProfile(profileName, { mfa_serial: serial });
    }
  }

  // 3. The 6-digit code.
  let code: string;
  if (opts.code) {
    code = opts.code;
  } else {
    assertInteractive();
    code = await input({
      message: t('Enter the 6-digit code from your MFA app:'),
      validate: (v) => (/^\d{6}$/.test(v.trim()) ? true : t('The code is 6 digits.')),
    });
  }

  const durationSeconds = opts.duration ? Number(opts.duration) : undefined;

  // 4. Ask STS for a session.
  const creds = await spin(t('Requesting a temporary session from AWS…'), () =>
    getSessionToken({ sourceProfile: profileName, region, serialNumber: serial!, tokenCode: code.trim(), durationSeconds }),
  );

  // 5. Store it as "<profile>-mfa" (matching the long-standing convention).
  const target = `${profileName}-mfa`;
  writeCredentials(target, {
    aws_access_key_id: creds.accessKeyId,
    aws_secret_access_key: creds.secretAccessKey,
    aws_session_token: creds.sessionToken,
  });
  if (region) writeConfigProfile(target, { region });

  box(
    [
      `${pc.dim(`${t('Profile')}:`)}  ${pc.yellow(target)}`,
      `${pc.dim(`${t('Expires')}:`)}  ${creds.expiration.toLocaleString()}  ${pc.dim(`(${t('in')} ${formatRelative(creds.expiration)})`)}`,
      '',
      pc.dim(`aws --profile ${target} sts get-caller-identity`),
      pc.dim(`awswiz use ${target}`),
    ],
    pc.bold(`✔ ${t('MFA session ready')}`),
  );
  log.blank();
}
