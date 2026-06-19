import { readFileSync } from 'node:fs';
import pc from 'picocolors';
import { t } from '../ui/i18n.js';
import { banner, log, outro } from '../ui/output.js';
import { select } from '../ui/prompts.js';
import { assumeCommand } from './assume.js';
import { doctorCommand } from './doctor.js';
import { loginCommand } from './login.js';
import { mfaCommand } from './mfa.js';
import { profileMenuCommand } from './profile.js';
import { regionCommand } from './region.js';
import { useCommand } from './use.js';
import { whoamiCommand } from './whoami.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

type MenuAction = 'whoami' | 'mfa' | 'assume' | 'login' | 'use' | 'profiles' | 'region' | 'doctor' | 'exit';

/** Interactive launcher shown when `awswiz` is run with no command (and a TTY). */
export async function menuCommand(): Promise<void> {
  banner(version);

  const action = await select<MenuAction>({
    message: t('What do you want to do?'),
    choices: [
      { name: `${pc.bold('whoami')}    ${pc.dim('— which account / role / profile am I?')}`, value: 'whoami' },
      { name: `${pc.bold('mfa')}       ${pc.dim('— start an MFA session')}`, value: 'mfa' },
      { name: `${pc.bold('assume')}    ${pc.dim('— assume a role (cross-account)')}`, value: 'assume' },
      { name: `${pc.bold('login')}     ${pc.dim('— sign in to SSO')}`, value: 'login' },
      { name: `${pc.bold('use')}       ${pc.dim('— switch the active profile')}`, value: 'use' },
      { name: `${pc.bold('profiles')}  ${pc.dim('— add / edit / remove / list')}`, value: 'profiles' },
      { name: `${pc.bold('region')}    ${pc.dim('— set a profile region')}`, value: 'region' },
      { name: `${pc.bold('doctor')}    ${pc.dim('— check your AWS setup')}`, value: 'doctor' },
      { name: pc.dim(t('exit')), value: 'exit' },
    ],
    pageSize: 10,
  });

  log.blank();

  switch (action) {
    case 'whoami':
      return whoamiCommand();
    case 'mfa':
      return mfaCommand();
    case 'assume':
      return assumeCommand();
    case 'login':
      return loginCommand();
    case 'use':
      return useCommand();
    case 'profiles':
      return profileMenuCommand();
    case 'region':
      return regionCommand();
    case 'doctor':
      return doctorCommand();
    case 'exit':
      outro(t('Bye!'));
      return;
  }
}
