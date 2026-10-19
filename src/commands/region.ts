import pc from 'picocolors';
import { getProfile, listProfiles } from '../core/aws-files.js';
import { writeConfigProfile } from '../core/aws-writer.js';
import { isAwsRegion } from '../core/util.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive, input, select } from '../ui/prompts.js';

export interface RegionOptions {
  profile?: string;
  region?: string;
}

/** Set the default region for a profile. */
export async function regionCommand(opts: RegionOptions = {}): Promise<void> {
  let name = opts.profile;
  if (!name) {
    assertInteractive();
    const profiles = await listProfiles();
    name = await select({
      message: t('Which profile?'),
      choices: profiles.map((p) => ({ name: `${pc.bold(p.name)}  ${pc.dim(p.region ?? 'no region')}`, value: p.name })),
    });
  }

  let region = opts.region;
  if (!region) {
    assertInteractive();
    region = await input({
      message: t('Region for {profile}:', { profile: name }),
      default: (await getProfile(name))?.region ?? 'us-east-1',
      validate: (v) => (isAwsRegion(v) ? true : t('Looks off — regions are like us-east-1, eu-west-2.')),
    });
  }
  // Flags were written unchecked: "awswiz region prod us-east1" saved a typo.
  if (!isAwsRegion(region)) {
    throw new AwswizError(t('"{region}" is not a region name.', { region }), {
      hint: t('Regions look like us-east-1, eu-west-2 or us-gov-west-1.'),
    });
  }
  if (!(await getProfile(name))) {
    throw new AwswizError(t('Profile "{profile}" not found.', { profile: name }), {
      hint: t('See your profiles with: awswiz profile list'),
    });
  }

  writeConfigProfile(name, { region: region.trim() });
  log.blank();
  log.success(t('{profile} region set to {region}.', { profile: name, region: region.trim() }));
}
