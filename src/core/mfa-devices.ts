import { IAMClient, ListMFADevicesCommand } from '@aws-sdk/client-iam';
import { fromIni } from '@aws-sdk/credential-providers';

/**
 * Auto-discover the MFA device serial(s) for the profile's user via IAM
 * ListMFADevices — so the user doesn't have to paste the ARN. Requires the
 * `iam:ListMFADevices` permission; callers fall back to asking when it throws.
 */
export async function discoverMfaDevices(sourceProfile: string, region: string): Promise<string[]> {
  const client = new IAMClient({ region, credentials: fromIni({ profile: sourceProfile }) });
  const out = await client.send(new ListMFADevicesCommand({}));
  return (out.MFADevices ?? [])
    .map((d) => d.SerialNumber)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}
