import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { t } from '../ui/i18n.js';
import { isJsonMode } from '../ui/output.js';

// A built-in check instead of update-notifier: that package alone took ~120 ms
// of every awswiz start (it loads dozens of modules), for a once-a-day lookup.

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateCache {
  /** When the registry was last asked (ms since epoch). */
  lastCheck: number;
  /** The latest published version seen, if the registry answered. */
  latest?: string;
}

/** Where the last check is remembered — per user, outside any project. */
export function updateCachePath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'awswiz', 'update-check.json');
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Compare two x.y.z[-pre] versions: positive when a is newer, null if either is malformed. */
export function compareVersions(a: string, b: string): number | null {
  const pa = VERSION_RE.exec(a);
  const pb = VERSION_RE.exec(b);
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  // A release outranks its own prereleases (1.0.0 > 1.0.0-rc.1).
  if (!pa[4] || !pb[4]) return pa[4] ? -1 : pb[4] ? 1 : 0;
  return pa[4].localeCompare(pb[4], 'en', { numeric: true });
}

/** The newer version to announce, or null when there is nothing to say. */
export function pendingUpdate(cache: UpdateCache | null, current: string): string | null {
  const latest = cache?.latest;
  if (!latest) return null;
  return (compareVersions(latest, current) ?? 0) > 0 ? latest : null;
}

/** True when the cached answer is old enough (or missing) to ask the registry again. */
export function isCheckDue(cache: UpdateCache | null, now: number): boolean {
  return !cache || !Number.isFinite(cache.lastCheck) || now - cache.lastCheck >= CHECK_INTERVAL_MS;
}

function readCache(path: string): UpdateCache | null {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<UpdateCache>;
    return typeof data.lastCheck === 'number' ? (data as UpdateCache) : null;
  } catch {
    return null;
  }
}

function writeCache(path: string, cache: UpdateCache): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache), 'utf8');
  } catch {
    // A read-only home just means no update notices — never a failed command.
  }
}

// Runs in a detached child so no command ever waits on the network: it stores
// the registry's answer, and the next run shows the notice.
const FETCH_SCRIPT = `
const fs = require('node:fs');
const path = require('node:path');
const [, cachePath, name, registry] = process.argv;
fetch(registry.replace(/\\/+$/, '') + '/' + name + '/latest', {
  signal: AbortSignal.timeout(10000),
  headers: { accept: 'application/json' },
})
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (!data || typeof data.version !== 'string') return;
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ lastCheck: Date.now(), latest: data.version }));
  })
  .catch(() => {});
`;

function refreshInBackground(cachePath: string, name: string): void {
  const registry = process.env.npm_config_registry || 'https://registry.npmjs.org';
  try {
    // process.execPath, no shell: a Node install path with spaces stays one argument.
    const child = spawn(process.execPath, ['-e', FETCH_SCRIPT, cachePath, name, registry], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Same as above: the check is best-effort.
  }
}

let suppressed = false;

/** Called after a successful `awswiz update`: the notice would now be stale. */
export function suppressUpdateNotice(): void {
  suppressed = true;
}

function isDisabled(): boolean {
  const env = process.env;
  return Boolean(env.CI || env.NO_UPDATE_NOTIFIER || env.AWSWIZ_NO_UPDATE_CHECK || env.NODE_ENV === 'test');
}

/**
 * Announce a newer awswiz (from the last check) when the process exits, and
 * refresh that knowledge in the background at most once a day. Notices go to
 * stderr and only in a terminal, so scripts and --json output are untouched.
 */
export function checkForUpdates(pkg: { name: string; version: string }): void {
  if (isDisabled()) return;

  const cachePath = updateCachePath();
  const cache = readCache(cachePath);
  const now = Date.now();
  if (isCheckDue(cache, now)) {
    // Stamp first, so an offline machine does not spawn a lookup on every run.
    writeCache(cachePath, { lastCheck: now, latest: cache?.latest });
    refreshInBackground(cachePath, pkg.name);
  }

  const latest = pendingUpdate(cache, pkg.version);
  if (!latest || process.argv[2] === 'update') return;
  process.once('exit', () => {
    if (suppressed || !process.stderr.isTTY || isJsonMode()) return;
    process.stderr.write(
      `\n${pc.yellow(`  ⬆ ${t('awswiz {latest} is available (you have {current}).', { latest, current: pkg.version })}`)}\n` +
        `${pc.dim(`    ${t('Update with: awswiz update')}`)}\n`,
    );
  });
}
