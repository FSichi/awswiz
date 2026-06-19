import { intro as clackIntro, note as clackNote, outro as clackOutro } from '@clack/prompts';
import pc from 'picocolors';

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

// ── Logging ──────────────────────────────────────────────────────────────────

export const log = {
  info(message: string): void {
    console.log(message);
  },
  success(message: string): void {
    console.log(pc.green(`  ✔ ${message}`));
  },
  warn(message: string): void {
    console.log(pc.yellow(`  ⚠ ${message}`));
  },
  error(message: string): void {
    console.error(pc.red(`  ✖ ${message}`));
  },
  dim(message: string): void {
    console.log(pc.dim(message));
  },
  step(message: string): void {
    console.log(pc.cyan(message));
  },
  blank(): void {
    console.log();
  },
};

// ── Styled elements ──────────────────────────────────────────────────────────

export function heading(text: string): void {
  console.log(pc.bold(pc.cyan(text)));
}

export function divider(): void {
  console.log(pc.dim('─'.repeat(50)));
}

/** Print a styled section header. */
export function section(title: string): void {
  console.log(`\n${pc.bold(pc.white(`  ${title}`))}`);
}

/** Open a branded session header with the current version (interactive menu). */
export function banner(version: string): void {
  clackIntro(`${pc.bold(pc.yellow('☁ awswiz'))} ${pc.dim(`v${version}`)}`);
}

/** Close a clack gutter session with a final line. */
export function outro(message = ''): void {
  clackOutro(message);
}

// ── Spinner ──────────────────────────────────────────────────────────────────

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Run an async function while showing a spinner; clears the line when done. */
export async function spin<T>(message: string, fn: () => Promise<T>): Promise<T> {
  let i = 0;
  let result: T;
  let error: unknown;

  const timer = setInterval(() => {
    process.stdout.write(`\r  ${pc.yellow(FRAMES[i++ % FRAMES.length])} ${message}`);
  }, 80);

  try {
    result = await fn();
  } catch (err) {
    error = err;
  } finally {
    clearInterval(timer);
    process.stdout.write('\r\x1b[K');
  }

  if (error) throw error;
  return result!;
}

// ── Box ────────────────────────────────────────────────────────────────────

/**
 * Draw a box around lines of text — delegates to clack's `note`, which measures
 * ANSI-aware widths. Optional `title` renders a label in the top border.
 */
export function box(lines: string[], title?: string): void {
  clackNote(lines.join('\n'), title);
}
