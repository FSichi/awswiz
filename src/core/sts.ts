import {
  AssumeRoleCommand,
  GetSessionTokenCommand,
  STSClient,
  type Credentials as AwsCredentials,
} from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';

export interface TempCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

function toTemp(creds: AwsCredentials | undefined): TempCredentials {
  if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
    throw new AwswizError(t('AWS returned an incomplete set of credentials.'));
  }
  return {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    expiration: creds.Expiration ?? new Date(Date.now() + 3600_000),
  };
}

function friendly(err: unknown): AwswizError {
  const name = (err as Error).name ?? 'Error';
  const map: Record<string, { msg: string; hint: string }> = {
    AccessDenied: {
      msg: t('AWS denied the request.'),
      hint: t('Your user may lack permission, or the MFA code/serial is wrong.'),
    },
    InvalidClientTokenId: {
      msg: t('The profile\'s access keys are invalid.'),
      hint: t('Check aws_access_key_id / aws_secret_access_key for this profile.'),
    },
    ValidationError: {
      msg: t('AWS rejected one of the values.'),
      hint: t('The MFA code must be the current 6 digits; the role ARN must be valid.'),
    },
    ExpiredToken: {
      msg: t('The base credentials have expired.'),
      hint: t('Refresh them (re-run mfa/login) and try again.'),
    },
  };
  const entry = map[name];
  if (entry) return new AwswizError(entry.msg, { hint: `${entry.hint}  (${name})` });
  return new AwswizError(`${t('AWS request failed')}: ${(err as Error).message}`, { hint: `(${name})` });
}

function client(sourceProfile: string, region: string): STSClient {
  return new STSClient({ region, credentials: fromIni({ profile: sourceProfile }) });
}

/** STS GetSessionToken — exchanges long-lived keys + an MFA code for temporary credentials. */
export async function getSessionToken(opts: {
  sourceProfile: string;
  region: string;
  serialNumber: string;
  tokenCode: string;
  durationSeconds?: number;
}): Promise<TempCredentials> {
  try {
    const out = await client(opts.sourceProfile, opts.region).send(
      new GetSessionTokenCommand({
        SerialNumber: opts.serialNumber,
        TokenCode: opts.tokenCode,
        DurationSeconds: opts.durationSeconds,
      }),
    );
    return toTemp(out.Credentials);
  } catch (err) {
    throw friendly(err);
  }
}

/** STS AssumeRole — get temporary credentials for another role/account. */
export async function assumeRole(opts: {
  sourceProfile: string;
  region: string;
  roleArn: string;
  sessionName: string;
  serialNumber?: string;
  tokenCode?: string;
  durationSeconds?: number;
}): Promise<TempCredentials> {
  try {
    const out = await client(opts.sourceProfile, opts.region).send(
      new AssumeRoleCommand({
        RoleArn: opts.roleArn,
        RoleSessionName: opts.sessionName,
        SerialNumber: opts.serialNumber,
        TokenCode: opts.tokenCode,
        DurationSeconds: opts.durationSeconds,
      }),
    );
    return toTemp(out.Credentials);
  } catch (err) {
    throw friendly(err);
  }
}
