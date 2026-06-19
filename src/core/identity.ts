import { fromIni } from '@aws-sdk/credential-providers';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { resolveRegion } from './aws-files.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';

export interface CallerIdentity {
  account: string;
  arn: string;
  userId: string;
  profile: string;
  region: string;
}

/**
 * Resolve the given profile's credentials and call STS GetCallerIdentity.
 * Throws a friendly AwswizError when the credentials can't be resolved.
 */
export async function whoami(profile: string): Promise<CallerIdentity> {
  const region = await resolveRegion(profile);
  const client = new STSClient({ region, credentials: fromIni({ profile }) });

  try {
    const out = await client.send(new GetCallerIdentityCommand({}));
    return {
      account: out.Account ?? '?',
      arn: out.Arn ?? '?',
      userId: out.UserId ?? '?',
      profile,
      region,
    };
  } catch (err) {
    throw new AwswizError(t('Could not resolve credentials for profile "{profile}".', { profile }), {
      hint: `${t('Check the profile exists and its keys are valid (awswiz doctor coming soon).')}  (${(err as Error).name})`,
    });
  }
}
