// Bundles src/extension.ts and the Svelte parser into one file, dist/extension.js.
// VS Code loads that one file, so the packaged extension doesn't need node_modules.

import esbuild from 'esbuild';

// `npm run build` makes a debuggable build. Packaging passes --production.
const production = process.argv.includes('--production');

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  format: 'cjs', // VS Code loads extensions as CommonJS modules
  platform: 'node', // extensions run in Node, not in a browser
  external: ['vscode'], // VS Code provides this module itself at runtime
  // Use Svelte's single prebuilt compiler file instead of its many source files.
  alias: { 'svelte/compiler': './node_modules/svelte/compiler/index.js' },
  minify: production,
  sourcemap: !production,
});
