import { existsSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import pc from 'picocolors';
import { awsFilePaths, listProfiles } from '../core/aws-files.js';
import { t } from '../ui/i18n.js';
import { log, section, spin } from '../ui/output.js';

/** Compare the local clock to AWS's server time (skew > ~30s breaks MFA/TOTP). */
function checkClockSkew(): Promise<number | null> {
  return new Promise((resolve) => {
    const req = httpsGet('https://sts.amazonaws.com/', (res) => {
      const date = res.headers.date;
      res.resume(); // drain
      if (!date) return resolve(null);
      const server = new Date(date).getTime();
      resolve((Date.now() - server) / 1000);
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function check(ok: boolean, label: string, detail?: string): void {
  const mark = ok ? pc.green('✔') : pc.red('✖');
  log.info(`  ${mark} ${label}${detail ? pc.dim(`  ${detail}`) : ''}`);
}

/** Run health checks: files present, profiles, and clock skew (the MFA killer). */
export async function doctorCommand(): Promise<void> {
  section(t('awswiz doctor'));
  log.blank();

  const { configFile, credentialsFile } = awsFilePaths();
  check(existsSync(configFile), t('~/.aws/config exists'), configFile);
  check(existsSync(credentialsFile), t('~/.aws/credentials exists'), credentialsFile);

  const profiles = await listProfiles();
  check(profiles.length > 0, t('{n} profile(s) configured', { n: profiles.length }));

  const skew = await spin(t('Checking your clock against AWS…'), checkClockSkew);
  if (skew === null) {
    log.warn(t('Could not reach AWS to check the clock (offline?).'));
  } else if (Math.abs(skew) <= 30) {
    check(true, t('Clock is in sync with AWS (±{n}s)', { n: Math.abs(Math.round(skew)) }));
  } else {
    log.warn(t('Your clock is off by {n}s — this breaks MFA. Sync your system time.', { n: Math.round(skew) }));
  }

  log.blank();
  log.dim(`  node ${process.version} · ${process.platform}/${process.arch}`);
  log.blank();
}
