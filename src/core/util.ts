import { spawn } from 'node:child_process';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';

/**
 * --duration as STS takes it: whole seconds, 900 (15 min) to 129600 (36 h).
 * "1h" or "abc" used to reach AWS as NaN and come back as a vague ValidationError.
 */
export function parseDuration(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const seconds = Number(value.trim());
  if (!Number.isInteger(seconds) || seconds < 900 || seconds > 129_600) {
    throw new AwswizError(t('--duration must be whole seconds between 900 and 129600 (got "{value}").', { value }), {
      hint: t('e.g. --duration 3600 for one hour.'),
    });
  }
  return seconds;
}

/**
 * A region name: us-east-1, eu-central-2, also us-gov-west-1 or
 * us-isob-east-1. The old pattern allowed one middle part and rejected GovCloud.
 */
export function isAwsRegion(value: string): boolean {
  return /^[a-z]{2}(-[a-z]+)+-\d{1,2}$/.test(value.trim());
}

/** An MFA code from a flag: exactly 6 digits, checked before AWS is asked. */
export function parseMfaCode(value: string): string {
  const code = value.trim();
  if (!/^\d{6}$/.test(code)) {
    throw new AwswizError(t('The MFA code must be the 6 digits your app shows (got "{value}").', { value }));
  }
  return code;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BrowserCommand {
  command: string;
  args: string[];
  /** Windows only: pass the command line through untouched (see below). */
  verbatim: boolean;
}

/**
 * How to hand a URL to the platform's browser.
 *
 * On Windows this goes through `cmd /c start`, and cmd.exe reads "&" as a
 * command separator — so any URL with more than one query parameter is
 * truncated at the first one unless it is escaped and passed verbatim. Sign-in
 * URLs are exactly that shape, which is why this is worth a test.
 */
export function browserCommandFor(url: string, platform: NodeJS.Platform = process.platform): BrowserCommand {
  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'start', '""', '/b', url.replace(/&/g, '^&')],
      verbatim: true,
    };
  }
  return { command: platform === 'darwin' ? 'open' : 'xdg-open', args: [url], verbatim: false };
}

/** Best-effort: open a URL in the default browser, cross-platform. Never throws. */
export function openBrowser(url: string): void {
  try {
    const { command, args, verbatim } = browserCommandFor(url);
    spawn(command, args, {
      stdio: 'ignore',
      detached: true,
      windowsVerbatimArguments: verbatim,
    }).unref();
  } catch {
    // Callers print the URL too, so this is only a convenience.
  }
}

/** Human-friendly "in 11h 59m" from a future date. */
export function formatRelative(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
