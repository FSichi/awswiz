import pc from 'picocolors';
import { getProfile, listProfiles, resolveRegion } from '../core/aws-files.js';
import { profileCredentials, stsClient, stsCommands } from '../core/sdk.js';
import { openBrowser } from '../core/util.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log, spin } from '../ui/output.js';
import { assertInteractive, select } from '../ui/prompts.js';

export interface ConsoleOptions {
  profile?: string;
  printUrl?: boolean;
}

// Sent to GetFederationToken; the effective permissions are the INTERSECTION of
// this policy and the IAM user's own permissions — it grants nothing extra.
const FEDERATION_POLICY = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }],
});

interface FederableCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
}

/**
 * Credentials the AWS sign-in federation endpoint accepts: role/SSO temporary
 * credentials work as-is; long-lived keys go through GetFederationToken.
 * GetSessionToken (mfa) sessions cannot federate — we fall back to their base profile.
 */
async function federableCredentials(profileName: string, region: string): Promise<FederableCredentials> {
  const info = await getProfile(profileName);
  if (!info) throw new AwswizError(t('Profile "{profile}" not found.', { profile: profileName }));

  if (info.kind === 'session') {
    const base = profileName.replace(/-mfa$/, '');
    if (base !== profileName && (await getProfile(base))) {
      return federableCredentials(base, region);
    }
    throw new AwswizError(t('Console sign-in needs role/SSO credentials or long-lived keys.'), {
      hint: t('Sessions from GetSessionToken cannot federate — use the base profile.'),
    });
  }

  if (info.kind === 'sso' || info.kind === 'role') {
    let resolved: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
    try {
      resolved = await (await profileCredentials(profileName))();
    } catch (err) {
      // A role that needs MFA (or an SSO profile signed out) surfaced as a raw SDK stack trace.
      throw new AwswizError(t('Could not resolve credentials for profile "{profile}".', { profile: profileName }), {
        hint: `${
          info.kind === 'sso'
            ? t('Sign in first: awswiz login -p {profile}', { profile: profileName })
            : t('If the role needs MFA, assume it first: awswiz assume -p {profile}', { profile: profileName })
        }  (${(err as Error).name})`,
      });
    }
    if (!resolved.sessionToken) {
      throw new AwswizError(t('Could not resolve credentials for profile "{profile}".', { profile: profileName }));
    }
    return {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
      sessionToken: resolved.sessionToken,
    };
  }

  // Long-lived keys → mint a federation token.
  const [{ GetFederationTokenCommand }, sts] = await Promise.all([stsCommands(), stsClient(profileName, region)]);
  const out = await sts.send(
    new GetFederationTokenCommand({ Name: 'awswiz', Policy: FEDERATION_POLICY, DurationSeconds: 43200 }),
  );
  const c = out.Credentials;
  if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken) {
    throw new AwswizError(t('AWS returned an incomplete set of credentials.'));
  }
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken };
}

/**
 * Where a region's console lives. China and GovCloud are separate partitions
 * with their own sign-in endpoints; the global one rejects their credentials.
 */
export function consoleEndpoints(region: string): { signin: string; console: string } {
  if (region.startsWith('cn-')) {
    return { signin: 'https://signin.amazonaws.cn', console: `https://console.amazonaws.cn/console/home?region=${region}` };
  }
  if (region.startsWith('us-gov-')) {
    return {
      signin: 'https://signin.amazonaws-us-gov.com',
      console: `https://console.amazonaws-us-gov.com/console/home?region=${region}`,
    };
  }
  return {
    signin: 'https://signin.aws.amazon.com',
    console: `https://${region}.console.aws.amazon.com/console/home?region=${region}`,
  };
}

/** Open the AWS web console in the browser, already signed in with a profile. */
export async function consoleCommand(opts: ConsoleOptions = {}): Promise<void> {
  let profile = opts.profile;
  if (!profile) {
    assertInteractive();
    const profiles = await listProfiles();
    profile = await select({
      message: t('Which profile do you want to open the console with?'),
      choices: profiles.map((p) => ({ name: `${pc.bold(p.name)}  ${pc.dim(p.region ?? '')}`, value: p.name })),
    });
  }
  const region = await resolveRegion(profile);

  const url = await spin(t('Creating a console sign-in link…'), async () => {
    const creds = await federableCredentials(profile!, region);
    const session = encodeURIComponent(
      JSON.stringify({
        sessionId: creds.accessKeyId,
        sessionKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      }),
    );
    const endpoints = consoleEndpoints(region);
    const response = await fetch(`${endpoints.signin}/federation?Action=getSigninToken&Session=${session}`, {
      // Without a limit a dead network left the spinner turning forever.
      signal: AbortSignal.timeout(20_000),
    }).catch((err: Error) => {
      throw new AwswizError(t('Could not reach the AWS sign-in service: {message}', { message: err.message }), {
        hint: t('Check your connection and try again.'),
      });
    });
    if (!response.ok) {
      throw new AwswizError(t('AWS rejected the federation request (HTTP {status}).', { status: response.status }), {
        hint: t('The credentials may be expired — renew the session and try again.'),
      });
    }
    const { SigninToken } = (await response.json()) as { SigninToken?: string };
    if (!SigninToken) throw new AwswizError(t('AWS did not return a sign-in token.'));

    const destination = encodeURIComponent(endpoints.console);
    return `${endpoints.signin}/federation?Action=login&Issuer=awswiz&Destination=${destination}&SigninToken=${encodeURIComponent(SigninToken)}`;
  });

  if (opts.printUrl) {
    // The URL IS a credential (valid ~15 min) — printed only on explicit request.
    log.info(url);
    return;
  }

  openBrowser(url);
  log.blank();
  log.success(t('Console opened in your browser — profile {profile}, region {region}.', { profile: pc.bold(profile), region }));
}
