import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  // bundle the workspace packages so the published server is standalone
  noExternal: [/^@diagonale\//, 'immer', 'nanoid', 'zod', 'zod-to-json-schema', 'fflate'],
});
