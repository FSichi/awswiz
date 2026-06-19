import { spawnSync } from 'node:child_process';
import { AwswizError } from '../ui/errors.js';
import { t } from '../ui/i18n.js';
import { log } from '../ui/output.js';
import { assertInteractive } from '../ui/prompts.js';

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

function detectPackageManager(): PackageManager {
  for (const pm of ['npm', 'yarn', 'pnpm', 'bun'] as const) {
    const result = spawnSync(pm, ['--version'], { stdio: 'ignore' });
    if (result.status === 0) return pm;
  }
  return 'npm';
}

function getUpdateCommand(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return 'npm i -g @fsichi/awswiz';
    case 'yarn':
      return 'yarn global add @fsichi/awswiz';
    case 'pnpm':
      return 'pnpm add -g @fsichi/awswiz';
    case 'bun':
      return 'bun add -g @fsichi/awswiz';
  }
}

function spin(message: string, fn: () => { ok: boolean; stderr: string }): { ok: boolean; stderr: string } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let result: { ok: boolean; stderr: string } = { ok: false, stderr: '' };

  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} ${message}`);
  }, 80);

  try {
    result = fn();
  } finally {
    clearInterval(timer);
    process.stdout.write('\r\x1b[K');
  }

  return result;
}

export interface UpdateOptions {
  packageManager?: PackageManager;
}

export async function updateCommand(opts: UpdateOptions = {}): Promise<void> {
  assertInteractive();

  let pm = opts.packageManager;
  if (!pm) {
    pm = detectPackageManager();
    log.dim(t('Detected package manager: {pm}', { pm }));
  }

  const cmd = getUpdateCommand(pm);

  log.info(t('Checking for updates…'));
  log.blank();

  const result = spin(t('Updating @fsichi/awswiz via {pm}…', { pm }), () => {
    const r = spawnSync(cmd, { shell: true, stdio: 'pipe', encoding: 'utf8' });
    return { ok: r.status === 0, stderr: r.stderr };
  });

  if (result.ok) {
    log.success(t('@fsichi/awswiz updated successfully! 🎉'));
    log.dim(t('Run "awswiz --version" to verify.'));
  } else {
    throw new AwswizError(t('Update failed.'), {
      hint: result.stderr || t('Try running the command manually: {cmd}', { cmd }),
    });
  }
}
