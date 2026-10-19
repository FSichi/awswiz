import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// When each SSO session was last signed into with a full sign-in (browser or
// device code). AWS keeps no such record — its cache only knows when the 1-hour
// access token expires — yet it is what the session's end counts from. Keyed by
// the same value as the token cache (sso-session name or start URL); no secrets.

type SignIns = Record<string, string>;

export function signInsPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'awswiz', 'sso-sign-ins.json');
}

function readAll(): SignIns {
  try {
    const data = JSON.parse(readFileSync(signInsPath(), 'utf8')) as unknown;
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as SignIns) : {};
  } catch {
    return {};
  }
}

/** Remember a completed full sign-in. Best effort: a read-only home just means no record. */
export function recordSsoSignIn(keySource: string, at = new Date()): void {
  try {
    const all = readAll();
    all[keySource] = at.toISOString();
    mkdirSync(dirname(signInsPath()), { recursive: true });
    writeFileSync(signInsPath(), JSON.stringify(all, null, 2), 'utf8');
  } catch {
    // never fail a login over bookkeeping
  }
}

/** When awswiz last signed into this session, or null when it never did (e.g. `aws sso login`). */
export function readSsoSignIn(keySource: string): Date | null {
  const raw = readAll()[keySource];
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
