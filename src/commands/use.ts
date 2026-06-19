import pc from 'picocolors';
import { listProfiles } from '../core/aws-files.js';
import { copyProfileToDefault } from '../core/aws-writer.js';
import { t } from '../ui/i18n.js';
import { box, log } from '../ui/output.js';
import { assertInteractive, select } from '../ui/prompts.js';

export interface UseOptions {
  profile?: string;
  default?: boolean;
}

/** The shell-specific line that sets AWS_PROFILE for the rest of the session. */
function exportLineForShell(profile: string): { line: string; note: string } {
  if (process.platform === 'win32') {
    // PowerShell sets PSModulePath; cmd.exe doesn't.
    if (process.env.PSModulePath) {
      return { line: `$env:AWS_PROFILE = "${profile}"`, note: t('(PowerShell — for cmd.exe use: set AWS_PROFILE={profile})', { profile }) };
    }
    return { line: `set AWS_PROFILE=${profile}`, note: t('(cmd.exe — for PowerShell use: $env:AWS_PROFILE="{profile}")', { profile }) };
  }
  const shell = process.env.SHELL ?? '';
  if (shell.includes('fish')) {
    return { line: `set -x AWS_PROFILE ${profile}`, note: t('(fish shell)') };
  }
  return { line: `export AWS_PROFILE=${profile}`, note: t('(bash / zsh)') };
}

/** Switch the active profile — either by printing the export line, or by writing [default]. */
export async function useCommand(opts: UseOptions = {}): Promise<void> {
  let name = opts.profile;
  if (!name) {
    assertInteractive();
    const profiles = await listProfiles();
    name = await select({
      message: t('Which profile do you want to use?'),
      choices: profiles.map((p) => ({ name: `${pc.bold(p.name)}  ${pc.dim(p.region ?? '')}`, value: p.name })),
    });
  }

  if (opts.default) {
    copyProfileToDefault(name);
    log.blank();
    log.success(t('Copied "{profile}" into the default profile — "aws" uses it everywhere now.', { profile: name }));
    return;
  }

  const { line, note } = exportLineForShell(name);
  box(
    [
      t("A tool can't change your shell's environment for you, so run this:"),
      '',
      pc.bold(line),
    ],
    pc.bold('awswiz use'),
  );
  log.dim(`  ${note}`);
  log.dim(`  ${t('Or make it the default (no env var needed): awswiz use {profile} --default', { profile: name })}`);
  log.blank();
}
