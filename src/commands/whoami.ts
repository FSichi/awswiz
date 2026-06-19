import pc from 'picocolors';
import { resolveProfileName } from '../core/aws-files.js';
import { whoami } from '../core/identity.js';
import { t } from '../ui/i18n.js';
import { box, spin } from '../ui/output.js';

export interface WhoamiOptions {
  profile?: string;
}

/** Show the active identity: which account, which user/role, which profile. */
export async function whoamiCommand(opts: WhoamiOptions = {}): Promise<void> {
  const profile = resolveProfileName(opts.profile);

  const identity = await spin(t('Checking your AWS identity…'), () => whoami(profile));

  box(
    [
      `${pc.dim(`${t('Account')}:`)}  ${pc.bold(identity.account)}`,
      `${pc.dim(`${t('Identity')}:`)} ${identity.arn}`,
      `${pc.dim(`${t('User ID')}:`)}  ${pc.dim(identity.userId)}`,
      '',
      `${pc.dim(`${t('Profile')}:`)}  ${pc.yellow(identity.profile)}   ${pc.dim(`${t('Region')}:`)} ${pc.cyan(identity.region)}`,
    ],
    pc.bold('aws whoami'),
  );
}
