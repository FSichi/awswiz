import { readFileSync } from 'node:fs';

/**
 * awswiz's own name and version. This module sits directly under src/ so that
 * "../package.json" is the package root both from src/ (tests) and from the
 * bundled files in dist/.
 */
export const PACKAGE = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { name: string; version: string };
