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

export interface SsoLoginTarget {
  startUrl: string;
  region: string;
  /** [sso-session X] name when the modern config format is used; null for legacy profiles. */
  sessionName: string | null;
  /** Registration scopes (modern format), e.g. ["sso:account:access"]. */
  scopes: string[];
}

export interface SsoToken {
  accessToken: string;
  expiresAt: Date;
}

/**
 * The SDK and the aws CLI look tokens up in ~/.aws/sso/cache by the SHA-1 of the
 * sso-session NAME (modern format) or of the start URL (legacy format). Writing
 * to the wrong key means the login "succeeds" but nothing ever finds the token.
 */
function cachePath(target: SsoLoginTarget): string {
  const key = createHash('sha1')
    .update(target.sessionName ?? target.startUrl)
    .digest('hex');
  return join(homedir(), '.aws', 'sso', 'cache', `${key}.json`);
}

/**
 * Run the IAM Identity Center (SSO) device-authorization flow and cache the
 * token exactly where the SDK/CLI expect it, including the client registration
 * (clientId/clientSecret) so session-based profiles can refresh.
 */
export async function ssoDeviceLogin(opts: {
  target: SsoLoginTarget;
  onPrompt: (info: { url: string; userCode: string }) => void;
}): Promise<SsoToken> {
  const { target } = opts;
  const client = new SSOOIDCClient({ region: target.region });

  const reg = await client.send(
    new RegisterClientCommand({
      clientName: 'awswiz',
      clientType: 'public',
      // Scopes matter for session-based logins (enable account access + refresh).
      ...(target.sessionName && target.scopes.length > 0 ? { scopes: target.scopes } : {}),
    }),
  );
  const auth = await client.send(
    new StartDeviceAuthorizationCommand({
      clientId: reg.clientId,
      clientSecret: reg.clientSecret,
      startUrl: target.startUrl,
    }),
  );

  opts.onPrompt({
    url: auth.verificationUriComplete ?? auth.verificationUri ?? target.startUrl,
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
      const expiresAt = new Date(Date.now() + (tok.expiresIn ?? 3600) * 1000);

      const dir = join(homedir(), '.aws', 'sso', 'cache');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        cachePath(target),
        JSON.stringify(
          {
            startUrl: target.startUrl,
            region: target.region,
            accessToken: tok.accessToken ?? '',
            expiresAt: expiresAt.toISOString(),
            clientId: reg.clientId,
            clientSecret: reg.clientSecret,
            registrationExpiresAt: reg.clientSecretExpiresAt
              ? new Date(reg.clientSecretExpiresAt * 1000).toISOString()
              : undefined,
            ...(tok.refreshToken ? { refreshToken: tok.refreshToken } : {}),
          },
          null,
          2,
        ),
        'utf8',
      );

      return { accessToken: tok.accessToken ?? '', expiresAt };
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
