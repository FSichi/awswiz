#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { assumeCommand } from './commands/assume.js';
import { doctorCommand } from './commands/doctor.js';
import { loginCommand } from './commands/login.js';
import { menuCommand } from './commands/menu.js';
import { mfaCommand } from './commands/mfa.js';
import {
  profileAddCommand,
  profileEditCommand,
  profileListCommand,
  profileMenuCommand,
  profileRemoveCommand,
} from './commands/profile.js';
import { regionCommand } from './commands/region.js';
import { updateCommand } from './commands/update.js';
import { useCommand } from './commands/use.js';
import { whoamiCommand } from './commands/whoami.js';
import { checkForUpdates } from './core/update-checker.js';
import { AwswizError } from './ui/errors.js';
import { t } from './ui/i18n.js';
import { log, setVerbose } from './ui/output.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { name: string; version: string };

checkForUpdates(pkg);

const program = new Command();

program
  .name('awswiz')
  .description(t('Friendly AWS credentials — wizards for profiles, MFA, assume-role and SSO'))
  .version(pkg.version)
  .option('--verbose', t('print extra detail'))
  .hook('preAction', (thisCommand) => setVerbose(Boolean(thisCommand.opts().verbose)));

program
  .command('whoami')
  .description(t('Show the active identity: account, role and profile'))
  .option('-p, --profile <name>', t('the AWS profile to use'))
  .action(whoamiCommand);

const profile = program.command('profile').description(t('Manage your AWS profiles in ~/.aws'));
profile.command('list').description(t('List the profiles found in ~/.aws')).action(profileListCommand);
profile.command('add').description(t('Add a new profile (access keys or SSO)')).action(profileAddCommand);
profile.command('edit').description(t('Edit a profile (region, keys, MFA serial)')).action(profileEditCommand);
profile
  .command('remove')
  .description(t('Remove a profile from ~/.aws'))
  .option('-p, --profile <name>', t('the profile to remove'))
  .action(profileRemoveCommand);
profile.action(profileMenuCommand); // bare "awswiz profile" → interactive hub

program
  .command('mfa')
  .description(t('Start an MFA session — creates a temporary "<profile>-mfa" profile'))
  .option('-p, --profile <name>', t('the base profile (with long-lived keys)'))
  .option('-c, --code <code>', t('the 6-digit MFA code (enables non-interactive mode)'))
  .option('-s, --serial <arn>', t('the MFA device ARN (mfa_serial)'))
  .option('-d, --duration <seconds>', t('session duration in seconds'))
  .action(mfaCommand);

program
  .command('assume')
  .description(t('Assume an IAM role and save the temporary credentials'))
  .option('-p, --profile <name>', t('the source profile'))
  .option('-r, --role <arn>', t('the role ARN to assume'))
  .option('--session-name <name>', t('the role session name'))
  .option('--target <name>', t('the profile to save the credentials as'))
  .option('-c, --code <code>', t('the 6-digit MFA code (if the role needs MFA)'))
  .option('-s, --serial <arn>', t('the MFA device ARN'))
  .option('-d, --duration <seconds>', t('session duration in seconds'))
  .action(assumeCommand);

program
  .command('login')
  .description(t('Sign in to IAM Identity Center (SSO)'))
  .option('-p, --profile <name>', t('an SSO profile to read the start URL from'))
  .option('--start-url <url>', t('the SSO start URL'))
  .option('--region <region>', t('the SSO region'))
  .action(loginCommand);

program
  .command('use')
  .description(t('Switch the active profile'))
  .argument('[profile]', t('the profile to use'))
  .option('--default', t('copy it into the default profile (no env var needed)'))
  .action((profileArg, opts) => useCommand({ profile: profileArg, default: opts.default }));

program
  .command('region')
  .description(t('Set the default region for a profile'))
  .argument('[profile]', t('the profile'))
  .argument('[region]', t('the region, e.g. us-east-1'))
  .action((profileArg, regionArg) => regionCommand({ profile: profileArg, region: regionArg }));

program.command('doctor').description(t('Check your AWS setup (files, clock skew, profiles)')).action(doctorCommand);

program
  .command('update')
  .description(t('Update awswiz to the latest version'))
  .option('--npm', t('use npm as package manager'))
  .option('--yarn', t('use yarn as package manager'))
  .option('--pnpm', t('use pnpm as package manager'))
  .option('--bun', t('use bun as package manager'))
  .action(async (opts) => {
    const pm = opts.npm ? 'npm' : opts.yarn ? 'yarn' : opts.pnpm ? 'pnpm' : opts.bun ? 'bun' : undefined;
    await updateCommand({ packageManager: pm });
  });

// No subcommand: launch the interactive menu in a terminal, or show help otherwise.
program.action(async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    program.outputHelp();
    return;
  }
  await menuCommand();
});

try {
  await program.parseAsync();
} catch (err) {
  if (err instanceof Error && err.name === 'ExitPromptError') {
    log.dim(t('Cancelled.'));
    process.exit(130);
  }
  if (err instanceof AwswizError) {
    log.error(err.message);
    if (err.hint) log.dim(`  ${err.hint}`);
    process.exit(1);
  }
  throw err;
}
