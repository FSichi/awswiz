import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareVersions, suppressUpdateNotice } from '../core/update-checker.js';
import { PACKAGE } from '../package-info.js';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log, spin } from '../ui/output.js';
import { assertInteractive } from '../ui/prompts.js';

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Which package manager installed this copy of awswiz, judged by where it lives.
 * Probing PATH instead (the old way) cost four process launches and could pick
 * npm for a pnpm install, leaving two copies fighting over the `awswiz` command.
 * Exported for unit tests.
 */
export function detectPackageManager(installPath: string): PackageManager {
  const path = installPath.replace(/\\/g, '/').toLowerCase();
  if (path.includes('/pnpm/') || path.includes('/.pnpm/')) return 'pnpm';
  if (path.includes('/.bun/')) return 'bun';
  if (path.includes('/yarn/')) return 'yarn';
  return 'npm';
}

/**
 * NVM for Windows 2.x keeps a trust record of every global command and blocks
 * one whose launcher changed since it was trusted — which an update does
 * ("delegated script changed since it was trusted", NVM4306) — until
 * `nvm reshim`. Its layout puts globals under …\nvm\installs\v<version>\; the
 * 1.x layout (…\nvm\v<version>\) has no such check and no reshim command.
 * Exported for unit tests.
 */
export function needsNvmReshim(installPath: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' && /[\\/]nvm[\\/]installs[\\/]v\d/i.test(installPath);
}

function getUpdateCommand(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return `npm i -g ${PACKAGE.name}`;
    case 'yarn':
      return `yarn global add ${PACKAGE.name}`;
    case 'pnpm':
      return `pnpm add -g ${PACKAGE.name}`;
    case 'bun':
      return `bun add -g ${PACKAGE.name}`;
  }
}

/** The version the registry would install, or null when it cannot be asked. */
async function fetchLatestVersion(): Promise<string | null> {
  const registry = (process.env.npm_config_registry || 'https://registry.npmjs.org').replace(/\/+$/, '');
  try {
    const res = await fetch(`${registry}/${PACKAGE.name}/latest`, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Run the install without blocking, so the spinner actually animates (the old
 * spawnSync froze its timer). A shell is needed because npm, pnpm and yarn are
 * .cmd shims on Windows; the command is a fixed string, so quoting cannot go wrong.
 */
function runInstall(cmd: string): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (err) => resolve({ ok: false, stderr: err.message }));
    child.on('close', (code) => resolve({ ok: code === 0, stderr: stderr.trim() }));
  });
}

export interface UpdateOptions {
  packageManager?: PackageManager;
}

export async function updateCommand(opts: UpdateOptions = {}): Promise<void> {
  assertInteractive();

  let pm = opts.packageManager;
  if (!pm) {
    pm = detectPackageManager(fileURLToPath(import.meta.url));
    log.dim(t('Detected package manager: {pm}', { pm }));
  }

  // Reinstalling an up-to-date package takes seconds and changes nothing.
  const latest = await spin(t('Checking for updates…'), fetchLatestVersion);
  if (latest && (compareVersions(latest, PACKAGE.version) ?? 1) <= 0) {
    log.success(t('You already have the latest version ({version}).', { version: PACKAGE.version }));
    return;
  }

  const cmd = getUpdateCommand(pm);
  const result = await spin(t('Updating @fsichi/awswiz via {pm}…', { pm }), () => runInstall(cmd));

  if (result.ok) {
    suppressUpdateNotice();
    log.success(t('@fsichi/awswiz updated successfully! 🎉'));
    log.dim(t('Run "awswiz --version" to verify.'));
    if (needsNvmReshim(fileURLToPath(import.meta.url))) {
      log.warn(t('NVM for Windows may block the updated command until it trusts it again.'));
      log.dim(`  ${t('If it says "delegated script changed since it was trusted", run: nvm reshim')}`);
    }
  } else {
    throw new AwswizError(t('Update failed.'), {
      hint: result.stderr || t('Try running the command manually: {cmd}', { cmd }),
    });
  }
}
