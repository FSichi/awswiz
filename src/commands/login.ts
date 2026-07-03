import pc from 'picocolors';
import { getConfigKeys, getSsoSessionKeys, listSsoProfiles } from '../core/aws-files.js';
import { whoami } from '../core/identity.js';
import { ssoDeviceLogin, type SsoLoginTarget } from '../core/sso.js';
import { openBrowser } from '../core/util.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { box, log, spin } from '../ui/output.js';
import { assertInteractive, input, select } from '../ui/prompts.js';

export interface LoginOptions {
  profile?: string;
  startUrl?: string;
  region?: string;
}

/**
 * Build the login target for a profile, resolving the modern [sso-session X]
 * indirection (start URL and region usually live in the session, not the profile).
 */
async function resolveTarget(profile: string): Promise<SsoLoginTarget> {
  const cfg = await getConfigKeys(profile);

  if (cfg.sso_session) {
    const session = await getSsoSessionKeys(cfg.sso_session);
    if (!session) {
      throw new AwswizError(t('The sso-session "{session}" was not found in ~/.aws/config.', { session: cfg.sso_session }));
    }
    if (!session.sso_start_url) {
      throw new AwswizError(t('The sso-session "{session}" has no sso_start_url.', { session: cfg.sso_session }));
    }
    return {
      startUrl: session.sso_start_url,
      region: session.sso_region ?? cfg.region ?? 'us-east-1',
      sessionName: cfg.sso_session,
      scopes: (session.sso_registration_scopes ?? 'sso:account:access').split(',').map((s) => s.trim()),
    };
  }

  if (cfg.sso_start_url) {
    return {
      startUrl: cfg.sso_start_url,
      region: cfg.sso_region ?? cfg.region ?? 'us-east-1',
      sessionName: null,
      scopes: [],
    };
  }

  throw new AwswizError(t('Profile "{profile}" is not an SSO profile.', { profile }), {
    hint: t('It has no sso_session or sso_start_url. Add one with "awswiz profile add" (SSO).'),
  });
}

/** Sign in to IAM Identity Center (SSO) via the device-authorization flow. */
export async function loginCommand(opts: LoginOptions = {}): Promise<void> {
  let profileName = opts.profile;
  let target: SsoLoginTarget | undefined;

  if (opts.startUrl) {
    // Explicit URL: legacy-style login, no profile attached.
    let region = opts.region;
    if (!region) {
      assertInteractive();
      region = await input({ message: t('SSO region:'), default: 'us-east-1' });
    }
    target = { startUrl: opts.startUrl.trim(), region: region.trim(), sessionName: null, scopes: [] };
  } else {
    // Pick an SSO-capable profile from ~/.aws instead of asking for the URL.
    // Always show the picker (even for a single profile) so the user sees and
    // confirms which profile they are signing in to; -p skips it for scripts.
    if (!profileName) {
      const candidates = await listSsoProfiles();
      if (candidates.length > 0) {
        assertInteractive();
        profileName = await select({
          message: t('Which SSO profile do you want to sign in with?'),
          choices: candidates.map((name) => ({ name, value: name })),
        });
      } else {
        assertInteractive();
        const url = await input({
          message: t('SSO start URL:'),
          placeholder: 'https://my-org.awsapps.com/start',
          validate: (v) => (v.trim().startsWith('http') ? true : t('Enter the full https start URL.')),
        });
        const region = await input({ message: t('SSO region:'), default: 'us-east-1' });
        target = { startUrl: url.trim(), region: region.trim(), sessionName: null, scopes: [] };
      }
    }
    if (profileName) target = await resolveTarget(profileName);
  }

  const token = await ssoDeviceLogin({
    target: target!,
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

  // Don't just claim success — prove the profile actually resolves credentials now.
  if (profileName) {
    try {
      const id = await spin(t('Verifying that the session actually works…'), () => whoami(profileName!));
      log.success(t('Verified — {profile} is ready (account {account}).', { profile: pc.bold(profileName), account: id.account }));
      log.dim(`  aws --profile ${profileName} s3 ls   ${pc.dim(`· awswiz use ${profileName}`)}`);
    } catch {
      log.warn(t('Signed in, but "{profile}" still could not resolve credentials.', { profile: profileName }));
      log.dim(`  ${t('Check sso_account_id / sso_role_name in the profile.')}`);
    }
  }
}
