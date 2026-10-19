import { defineConfig } from 'tsup';

export default defineConfig({
  // cli.js is a tiny launcher; main.js is the CLI, loaded after cli.js turns on
  // Node's compile cache (see src/cli.ts).
  entry: ['src/cli.ts', 'src/main.ts'],
  external: ['./main.js'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: false,
  sourcemap: false,
  minify: false,
  // Ship self-contained files: no runtime dependencies to install (the AWS SDK
  // alone is ~100 packages), and nothing to resolve from node_modules at start.
  noExternal: [/^[^.]/],
  // Code splitting keeps each AWS SDK client in its own chunk, loaded only by
  // the commands that call AWS (see src/core/sdk.ts).
  splitting: true,
  // Bundled CommonJS dependencies still call require() for Node built-ins; ESM
  // has no require, so provide one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
});
