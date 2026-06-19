import pc from 'picocolors';
import { getConfigKeys } from '../core/aws-files.js';
import { ssoDeviceLogin } from '../core/sso.js';
import { openBrowser } from '../core/util.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, log } from '../ui/output.js';
import { assertInteractive, input } from '../ui/prompts.js';

export interface LoginOptions {
  profile?: string;
  startUrl?: string;
  region?: string;
}

/** Sign in to IAM Identity Center (SSO) via the device-authorization flow. */
export async function loginCommand(opts: LoginOptions = {}): Promise<void> {
  let startUrl = opts.startUrl;
  let region = opts.region;

  // Pull the SSO settings from the profile when one is given.
  if (opts.profile) {
    const cfg = await getConfigKeys(opts.profile);
    startUrl ??= cfg.sso_start_url;
    region ??= cfg.sso_region;
    if (!startUrl) {
      throw new AwswizError(t('Profile "{profile}" has no sso_start_url.', { profile: opts.profile }), {
        hint: t('Add it with "awswiz profile add" (SSO), or pass --start-url.'),
      });
    }
  }

  if (!startUrl) {
    assertInteractive();
    startUrl = await input({
      message: t('SSO start URL:'),
      placeholder: 'https://my-org.awsapps.com/start',
      validate: (v) => (v.trim().startsWith('http') ? true : t('Enter the full https start URL.')),
    });
  }
  if (!region) {
    assertInteractive();
    region = await input({ message: t('SSO region:'), default: 'us-east-1' });
  }

  const token = await ssoDeviceLogin({
    startUrl: startUrl.trim(),
    region: region.trim(),
    onPrompt: ({ url, userCode }) => {
      box(
        [
          t('Approve this sign-in in your browser:'),
          '',
          pc.bold(url),
          '',
          `${t('Verification code')}: ${pc.bold(userCode)}`,
        ],
        pc.bold('aws sso login'),
      );
      openBrowser(url);
      log.dim(`  ${t('Waiting for you to approve…')}`);
    },
  });

  log.blank();
  log.success(t('Signed in. Token valid until {time}.', { time: token.expiresAt.toLocaleString() }));
}
