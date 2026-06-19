import { spawn } from 'node:child_process';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Best-effort: open a URL in the default browser, cross-platform. Never throws. */
export function openBrowser(url: string): void {
  try {
    const [command, args] =
      process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : process.platform === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]];
    spawn(command, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // The caller always prints the URL too, so this is just a convenience.
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
