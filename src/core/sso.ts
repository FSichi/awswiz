import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  CreateTokenCommand,
  RegisterClientCommand,
  SSOOIDCClient,
  StartDeviceAuthorizationCommand,
} from '@aws-sdk/client-sso-oidc';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { sleep } from './util.js';

export interface SsoToken {
  accessToken: string;
  expiresAt: Date;
  region: string;
  startUrl: string;
}

/** Write the SSO access token to the cache the AWS SDK/CLI reads (legacy start-url key). */
function writeSsoCache(token: SsoToken): void {
  const dir = join(homedir(), '.aws', 'sso', 'cache');
  mkdirSync(dir, { recursive: true });
  const key = createHash('sha1').update(token.startUrl).digest('hex');
  writeFileSync(
    join(dir, `${key}.json`),
    JSON.stringify(
      {
        startUrl: token.startUrl,
        region: token.region,
        accessToken: token.accessToken,
        expiresAt: token.expiresAt.toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
}

/**
 * Run the IAM Identity Center (SSO) device-authorization flow:
 * register a client, ask the user to approve a code in the browser, then poll
 * until a token is issued and cache it. Returns the token.
 */
export async function ssoDeviceLogin(opts: {
  startUrl: string;
  region: string;
  onPrompt: (info: { url: string; userCode: string }) => void;
}): Promise<SsoToken> {
  const client = new SSOOIDCClient({ region: opts.region });

  const reg = await client.send(
    new RegisterClientCommand({ clientName: 'awswiz', clientType: 'public' }),
  );
  const auth = await client.send(
    new StartDeviceAuthorizationCommand({
      clientId: reg.clientId,
      clientSecret: reg.clientSecret,
      startUrl: opts.startUrl,
    }),
  );

  opts.onPrompt({
    url: auth.verificationUriComplete ?? auth.verificationUri ?? opts.startUrl,
    userCode: auth.userCode ?? '',
  });

  const interval = (auth.interval ?? 5) * 1000;
  const deadline = Date.now() + (auth.expiresIn ?? 600) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    try {
      const tok = await client.send(
        new CreateTokenCommand({
          clientId: reg.clientId,
          clientSecret: reg.clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode: auth.deviceCode,
        }),
      );
      const token: SsoToken = {
        accessToken: tok.accessToken ?? '',
        expiresAt: new Date(Date.now() + (tok.expiresIn ?? 3600) * 1000),
        region: opts.region,
        startUrl: opts.startUrl,
      };
      writeSsoCache(token);
      return token;
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'AuthorizationPendingException') continue;
      if (name === 'SlowDownException') {
        await sleep(interval);
        continue;
      }
      throw new AwswizError(`${t('SSO login failed')}: ${(err as Error).message}`, { hint: `(${name})` });
    }
  }

  throw new AwswizError(t('SSO login timed out — the code expired before it was approved.'));
}
