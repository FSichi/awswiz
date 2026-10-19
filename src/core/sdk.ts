// The AWS SDK, loaded on first use. Imported at the top of every module it was
// the bulk of start-up time — paid even by `status`, `use`, `region` or
// `--version`, which never call AWS. Each helper pulls in only the client it needs.

import type { fromIni } from '@aws-sdk/credential-providers';

type CredentialProvider = ReturnType<typeof fromIni>;

/**
 * Credentials for a profile, resolved the way the aws CLI does. Read fresh every
 * time: awswiz may have just written a renewed session into ~/.aws.
 */
export async function profileCredentials(profile: string): Promise<CredentialProvider> {
  const { fromIni } = await import('@aws-sdk/credential-providers');
  return fromIni({ profile, ignoreCache: true });
}

export async function stsClient(profile: string, region: string) {
  const [{ STSClient }, credentials] = await Promise.all([
    import('@aws-sdk/client-sts'),
    profileCredentials(profile),
  ]);
  return new STSClient({ region, credentials });
}

export async function iamClient(profile: string, region: string) {
  const [{ IAMClient }, credentials] = await Promise.all([
    import('@aws-sdk/client-iam'),
    profileCredentials(profile),
  ]);
  return new IAMClient({ region, credentials });
}

export function stsCommands() {
  return import('@aws-sdk/client-sts');
}
