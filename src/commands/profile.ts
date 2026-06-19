import pc from 'picocolors';
import { getProfile, listProfiles, type CredentialKind } from '../core/aws-files.js';
import { removeProfile, writeConfigProfile, writeCredentials } from '../core/aws-writer.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, confirm, input, password, select } from '../ui/prompts.js';

const KIND_BADGE: Record<CredentialKind, string> = {
  keys: pc.green('keys'),
  sso: pc.magenta('sso'),
  role: pc.blue('role'),
  session: pc.yellow('mfa/session'),
  unknown: pc.dim('—'),
};

function validateName(value: string): true | string {
  const n = value.trim();
  if (!n) return t('Name cannot be empty.');
  if (!/^[A-Za-z0-9._-]+$/.test(n)) return t('Use letters, numbers, dots, dashes and underscores.');
  return true;
}

/** List every profile found in ~/.aws with a badge for how it authenticates. */
export async function profileListCommand(): Promise<void> {
  const profiles = await listProfiles();

  log.blank();
  if (profiles.length === 0) {
    log.warn(t('No AWS profiles found.'));
    log.dim(`  ${t('Create one with "awswiz profile add", or run "aws configure".')}`);
    return;
  }

  log.info(pc.bold(`  ${t('{n} profile(s) in ~/.aws:', { n: profiles.length })}`));
  log.blank();
  const width = Math.max(...profiles.map((p) => p.name.length));
  for (const p of profiles) {
    const region = p.region ? pc.cyan(p.region) : pc.dim('no region');
    log.info(`    ${pc.bold(p.name.padEnd(width))}   ${KIND_BADGE[p.kind].padEnd(20)}  ${region}`);
  }
  log.blank();
}

/** Wizard to create a profile (access keys or SSO) in ~/.aws. */
export async function profileAddCommand(): Promise<void> {
  assertInteractive();
  const existing = (await listProfiles()).map((p) => p.name);

  const name = (await input({ message: t('Profile name:'), validate: validateName })).trim();
  if (existing.includes(name)) {
    const overwrite = await confirm({
      message: t('Profile "{profile}" already exists. Overwrite its settings?', { profile: name }),
      default: false,
    });
    if (!overwrite) {
      log.dim(t('Cancelled.'));
      return;
    }
  }

  const kind = await select<'keys' | 'sso'>({
    message: t('How does this profile authenticate?'),
    choices: [
      { name: `${pc.bold('Access keys')}  ${pc.dim('— an IAM user access key + secret')}`, value: 'keys' },
      { name: `${pc.bold('IAM Identity Center (SSO)')}  ${pc.dim('— start URL + account + role')}`, value: 'sso' },
    ],
  });

  if (kind === 'keys') {
    const accessKeyId = await input({
      message: t('AWS access key ID:'),
      validate: (v) => (v.trim().length >= 16 ? true : t('That does not look like an access key ID.')),
    });
    const secret = await password({
      message: t('AWS secret access key:'),
      validate: (v) => (v.trim().length >= 20 ? true : t('That does not look like a secret access key.')),
    });
    const region = await input({ message: t('Default region:'), default: 'us-east-1' });
    writeCredentials(name, { aws_access_key_id: accessKeyId.trim(), aws_secret_access_key: secret.trim() });
    writeConfigProfile(name, { region: region.trim() });
  } else {
    const startUrl = await input({
      message: t('SSO start URL:'),
      placeholder: 'https://my-org.awsapps.com/start',
      validate: (v) => (v.trim().startsWith('http') ? true : t('Enter the full https start URL.')),
    });
    const ssoRegion = await input({ message: t('SSO region:'), default: 'us-east-1' });
    const accountId = await input({
      message: t('AWS account ID:'),
      validate: (v) => (/^\d{12}$/.test(v.trim()) ? true : t('Account IDs are 12 digits.')),
    });
    const roleName = await input({ message: t('SSO role name (permission set):') });
    const region = await input({ message: t('Default region:'), default: ssoRegion });
    writeConfigProfile(name, {
      sso_start_url: startUrl.trim(),
      sso_region: ssoRegion.trim(),
      sso_account_id: accountId.trim(),
      sso_role_name: roleName.trim(),
      region: region.trim(),
    });
  }

  log.blank();
  log.success(t('Profile "{profile}" saved.', { profile: name }));
}

/** Wizard to change a single field of an existing profile. */
export async function profileEditCommand(): Promise<void> {
  assertInteractive();
  const profiles = await listProfiles();
  if (profiles.length === 0) {
    log.warn(t('No profiles to edit.'));
    return;
  }
  const name = await select({
    message: t('Which profile do you want to edit?'),
    choices: profiles.map((p) => ({ name: p.name, value: p.name })),
  });
  const current = await getProfile(name);

  const field = await select<'region' | 'keys' | 'mfa'>({
    message: t('What do you want to change?'),
    choices: [
      { name: t('Region'), value: 'region' },
      { name: t('Access keys'), value: 'keys' },
      { name: t('MFA device ARN'), value: 'mfa' },
    ],
  });

  if (field === 'region') {
    const region = await input({ message: t('New region:'), default: current?.region ?? 'us-east-1' });
    writeConfigProfile(name, { region: region.trim() });
  } else if (field === 'keys') {
    const accessKeyId = await input({ message: t('New access key ID:') });
    const secret = await password({ message: t('New secret access key:') });
    writeCredentials(name, { aws_access_key_id: accessKeyId.trim(), aws_secret_access_key: secret.trim() });
  } else {
    const serial = await input({ message: t('MFA device ARN:'), default: current?.mfaSerial ?? '' });
    writeConfigProfile(name, { mfa_serial: serial.trim() });
  }

  log.blank();
  log.success(t('Profile "{profile}" updated.', { profile: name }));
}

/** Remove a profile from both ~/.aws files. */
export async function profileRemoveCommand(opts: { profile?: string } = {}): Promise<void> {
  let name = opts.profile;
  if (!name) {
    assertInteractive();
    const profiles = await listProfiles();
    if (profiles.length === 0) {
      log.warn(t('No profiles to remove.'));
      return;
    }
    name = await select({
      message: t('Which profile do you want to remove?'),
      choices: profiles.map((p) => ({ name: p.name, value: p.name })),
    });
    const sure = await confirm({
      message: t('Remove "{profile}" from ~/.aws? This cannot be undone.', { profile: name }),
      default: false,
    });
    if (!sure) {
      log.dim(t('Cancelled.'));
      return;
    }
  }

  log.blank();
  if (removeProfile(name)) log.success(t('Profile "{profile}" removed.', { profile: name }));
  else log.warn(t('Profile "{profile}" was not found.', { profile: name }));
}

/** Interactive hub when `awswiz profile` is run with no subcommand. */
export async function profileMenuCommand(): Promise<void> {
  assertInteractive();
  const action = await select<'list' | 'add' | 'edit' | 'remove'>({
    message: t('Profiles — what do you want to do?'),
    choices: [
      { name: t('List profiles'), value: 'list' },
      { name: t('Add a profile'), value: 'add' },
      { name: t('Edit a profile'), value: 'edit' },
      { name: t('Remove a profile'), value: 'remove' },
    ],
  });
  log.blank();
  if (action === 'list') return profileListCommand();
  if (action === 'add') return profileAddCommand();
  if (action === 'edit') return profileEditCommand();
  return profileRemoveCommand();
}
