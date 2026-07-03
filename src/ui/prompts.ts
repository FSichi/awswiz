import {
  confirm as clackConfirm,
  isCancel,
  multiselect as clackMultiselect,
  password as clackPassword,
  select as clackSelect,
  text as clackText,
} from '@clack/prompts';
import { AwswizError } from './errors.js';
import { t } from './i18n.js';

// clack returns a `cancel` symbol on Ctrl-C instead of throwing. We re-throw an
// error tagged `ExitPromptError` so cli.ts's central handler prints "Cancelled."
// and exits 130 — no call site changes.

function unwrap<T>(value: T | symbol): T {
  if (isCancel(value)) {
    const err = new Error('Prompt cancelled');
    err.name = 'ExitPromptError';
    throw err;
  }
  return value as T;
}

/** inquirer-style validate: returns `true`/undefined when valid, or an error string. */
type Validate = (value: string) => boolean | string | undefined;

function adaptValidate(validate?: Validate) {
  if (!validate) return undefined;
  return (value: string | undefined): string | undefined => {
    const result = validate(value ?? '');
    return result === true || result === undefined ? undefined : (result as string);
  };
}

export interface Choice<T> {
  name: string;
  value: T;
  checked?: boolean;
  hint?: string;
  short?: string;
}

export async function select<T>(opts: {
  message: string;
  choices: Choice<T>[];
  pageSize?: number;
}): Promise<T> {
  const options = opts.choices.map((c) => ({ value: c.value as unknown, label: c.name, hint: c.hint }));
  return unwrap(await clackSelect({ message: opts.message, options, maxItems: opts.pageSize })) as T;
}

export async function input(opts: {
  message: string;
  default?: string;
  placeholder?: string;
  validate?: Validate;
}): Promise<string> {
  return unwrap(
    await clackText({
      message: opts.message,
      placeholder: opts.placeholder ?? opts.default,
      defaultValue: opts.default,
      validate: adaptValidate(opts.validate),
    }),
  );
}

export async function password(opts: { message: string; validate?: Validate }): Promise<string> {
  return unwrap(
    await clackPassword({ message: opts.message, mask: '•', validate: adaptValidate(opts.validate) }),
  );
}

export async function confirm(opts: { message: string; default?: boolean }): Promise<boolean> {
  return unwrap(await clackConfirm({ message: opts.message, initialValue: opts.default ?? true }));
}

export async function checkbox<T>(opts: { message: string; choices: Choice<T>[] }): Promise<T[]> {
  const options = opts.choices.map((c) => ({ value: c.value as unknown, label: c.name, hint: c.hint }));
  const initialValues = opts.choices.filter((c) => c.checked).map((c) => c.value as unknown);
  return unwrap(
    await clackMultiselect({ message: opts.message, options, initialValues, required: false }),
  ) as T[];
}

export function assertInteractive(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new AwswizError(t('This command is interactive and requires a terminal.'), {
      hint: t('Run it directly in your terminal, not from a script or CI.'),
    });
  }
}
