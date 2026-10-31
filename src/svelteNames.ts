// The hand-kept lists: which names and files count as Svelte or SvelteKit.
// When either one adds something new, this is the file to update.

import { basename } from 'node:path';

// Every rune in the Svelte docs. `$inspect(...).with` isn't here because it
// has a different shape; findMarks.ts handles it separately.
export const RUNES = new Set([
  '$state',
  '$state.raw',
  '$state.snapshot',
  '$state.eager',
  '$derived',
  '$derived.by',
  '$effect',
  '$effect.pre',
  '$effect.tracking',
  '$effect.pending',
  '$effect.root',
  '$props',
  '$props.id',
  '$bindable',
  '$inspect',
  '$inspect.trace',
  '$host',
]);

// Import paths that get a mark. This includes older names like $lib and $env/*,
// because plenty of code still uses them.
const MARKED_IMPORT =
  /^(svelte|\$lib|#lib|\$app|\$env|\$service-worker|@sveltejs\/[a-z-]+)(?:\/|$)|\/(\$types)(?:\.js)?$/;

// The part of an import path that gets the mark: `$app` in `$app/forms` and
// `$types` in `./$types`. What follows it is an ordinary path.
export function markedImportPart(importPath: string): string | undefined {
  const match = importPath.match(MARKED_IMPORT);
  return match?.[1] ?? match?.[2];
}

// Modules that provide Svelte's or SvelteKit's own functions and values.
const OWN_NAMES_IMPORT = /^(svelte|\$app|\$service-worker|@sveltejs\/[a-z-]+)(\/|$)/;

// $app/env/public and $app/env/private hold your own environment variables.
const YOUR_VARIABLES_IMPORT = /^\$app\/env\/(private|public)$/;

// Does importing from this path bring in Svelte's or SvelteKit's own names?
// If so, those names get marked wherever they're used. The other marked paths,
// like $lib, point at your own code, so their names stay unmarked.
export function importsOwnNames(importPath: string): boolean {
  return OWN_NAMES_IMPORT.test(importPath) && !YOUR_VARIABLES_IMPORT.test(importPath);
}

// What each kind of SvelteKit file can export. An export only means something
// special in the right file: `load` in a plain .js file is just a function.
const PAGE_EXPORTS = ['load', 'prerender', 'ssr', 'csr', 'trailingSlash', 'config', 'entries'];
const SERVER_EXPORTS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
  'QUERY',
  'fallback',
  'prerender',
  'trailingSlash',
  'config',
  'entries',
];
const HOOK_EXPORTS = ['handle', 'handleFetch', 'handleError', 'init', 'reroute', 'transport'];

// <script> attributes that plain HTML doesn't have.
export const SCRIPT_ATTRIBUTES = new Set(['module', 'context', 'generics']);

export function specialExports(filePath: string): string[] {
  const name = basename(filePath);
  if (/^\+(page|layout)(@[^.]*)?\.svelte$/.test(name)) return ['snapshot'];
  if (/^\+page\.server\.[jt]s$/.test(name)) return [...PAGE_EXPORTS, 'actions'];
  if (/^\+(page|layout)(\.server)?\.[jt]s$/.test(name)) return PAGE_EXPORTS;
  if (/^\+server\.[jt]s$/.test(name)) return SERVER_EXPORTS;
  if (/(^|[\\/])src[\\/]hooks(\.server|\.client)?\.[jt]s$/.test(filePath)) return HOOK_EXPORTS;
  if (/(^|[\\/])src[\\/]params[\\/][^\\/]+\.[jt]s$/.test(filePath)) return ['match'];
  return [];
}

// The props SvelteKit passes to page and layout components. As with exports, the
// file decides: in any other component, `data` is a prop you named yourself.
export function kitProps(filePath: string): string[] {
  const name = basename(filePath);
  if (/^\+page(@[^.]*)?\.svelte$/.test(name)) return ['data', 'form', 'params'];
  if (/^\+layout(@[^.]*)?\.svelte$/.test(name)) return ['data'];
  return [];
}

// Runes only work in components and in modules with .svelte in their name, like
// a.svelte.js and a.svelte.test.ts. Anywhere else, `$state()` is just an ordinary
// function call.
export function allowsRunes(filePath: string): boolean {
  return /\.svelte((\.[^.\\/]+)*\.[jt]s)?$/.test(filePath);
}

// Very large files are almost always generated, and parsing them on every
// pause in typing would slow the editor down.
const LARGEST_SCRIPT_FILE = 500_000;

// A quick check, so ordinary JS files never reach the parser.
const MENTIONS_SVELTE = /svelte|\$app|\$env|\$lib|#lib|\$types/;

// SvelteKit's page templates. Any other HTML file is left alone.
export function isKitTemplate(filePath: string): boolean {
  return /(^|[\\/])src[\\/](app|error)\.html$/.test(filePath);
}

export function shouldScan(filePath: string, text: string): boolean {
  if (filePath.endsWith('.svelte') || isKitTemplate(filePath)) return true;
  if (!/\.(js|mjs|ts|mts)$/.test(filePath) || filePath.endsWith('.d.ts')) return false;
  if (text.length > LARGEST_SCRIPT_FILE) return false;
  return allowsRunes(filePath) || specialExports(filePath).length > 0 || MENTIONS_SVELTE.test(text);
}
