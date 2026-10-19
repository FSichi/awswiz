#!/usr/bin/env node
import * as nodeModule from 'node:module';

// Start-up time is paid on every call, so keep the bytecode of the bundle below
// between runs (Node's compile cache). It has to be switched on before that
// bundle loads, hence this tiny separate entry. Node 20 has no compile cache —
// the optional call makes it a no-op there.
nodeModule.enableCompileCache?.();

// picocolors (used by clack too) turns colors on unconditionally on Windows, even
// when stdout is a pipe — a script or agent then reads escape codes instead of
// text. Plain output unless a terminal is attached or colors are asked for.
// This must run before main.js loads: picocolors decides once, at import time.
if (!process.stdout.isTTY && !process.env.FORCE_COLOR && !process.argv.includes('--color')) {
  process.env.NO_COLOR ??= '1';
}

await import('./main.js');
