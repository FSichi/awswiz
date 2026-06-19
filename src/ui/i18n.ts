import { MESSAGES_ES } from './messages-es.js';

export type Locale = 'en' | 'es';

function detectLocale(): Locale {
  const env =
    process.env.AWSWIZ_LANG ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG;
  if (env && env.trim() !== '') {
    return env.trim().toLowerCase().startsWith('es') ? 'es' : 'en';
  }
  try {
    const system = Intl.DateTimeFormat().resolvedOptions().locale;
    if (system?.toLowerCase().startsWith('es')) return 'es';
  } catch {
    // fall through to English
  }
  return 'en';
}

let locale: Locale = detectLocale();

/** Apply the config language. An explicit AWSWIZ_LANG env var always wins. */
export function setLocale(value: Locale | 'auto'): void {
  if (process.env.AWSWIZ_LANG) return;
  if (value !== 'auto') locale = value;
}

export function getLocale(): Locale {
  return locale;
}

/**
 * Translate a UI string. The English text is the lookup key; a missing entry
 * falls back to English, so untranslated strings degrade gracefully.
 * `{placeholders}` are replaced from `vars` after translation.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = locale === 'es' ? (MESSAGES_ES[text] ?? text) : text;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      out = out.replaceAll(`{${key}}`, String(value));
    }
  }
  return out;
}
