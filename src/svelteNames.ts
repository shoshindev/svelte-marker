// The hand-kept lists: which names and files count as Svelte or SvelteKit.
// When either one adds something new, this is the file to update.

import { basename } from 'node:path';
import { fn, hasMember, MODULE_SHAPES, plain, type Shape, type ShapeRef, values } from './shapes.ts';

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

// Import paths that get a mark. Svelte and SvelteKit fix every part of a path
// like `$app/forms` or `svelte/transition`, so all of it gets the mark. After
// `$lib` and `#lib` comes the path to a file of yours, and before `$types` the
// path to your route, so only those placeholders get one. This includes older
// names like $lib and $env/*, because plenty of code still uses them.
const FIXED_IMPORT = /^(?:svelte|\$app|\$env|\$service-worker|@sveltejs\/[a-z-]+)(?:\/.*)?$/;
const PLACEHOLDER_IMPORT = /^(\$lib|#lib)(?:\/|$)|\/(\$types)(?:\.d\.ts|\.[jt]s)?$/;

// The part of an import path that gets the mark: all of `$app/forms`, and `$lib`
// in `$lib/utils`.
export function markedImportPart(importPath: string): string | undefined {
  if (FIXED_IMPORT.test(importPath)) return importPath;
  const match = importPath.match(PLACEHOLDER_IMPORT);
  return match?.[1] ?? match?.[2];
}

// Modules whose exports are all Svelte's or SvelteKit's own functions, values
// and types.
const OWN_NAMES_IMPORT = /^(svelte|\$app|\$service-worker|@sveltejs\/[a-z-]+)(\/|$)|\/\$types(\.d\.ts|\.[jt]s)?$/;

// $app/env/public and $app/env/private hold your own environment variables.
const YOUR_VARIABLES_IMPORT = /^\$app\/env\/(private|public)$/;

// Modules with one name of SvelteKit's among names of yours. `env` from
// $env/dynamic/private is SvelteKit's, though the variables it holds are yours.
const ENV_MODULE: Shape = { members: plain('env') };
const PARTLY_OWN_MODULES: Record<string, Shape> = {
  '$env/dynamic/private': ENV_MODULE,
  '$env/dynamic/public': ENV_MODULE,
};

// What a whole module holds, as `import * as kit` and `await import()` give it,
// or null when its names are yours, as with $lib. Every kind of import asks this
// one question, so they all agree on which names are Svelte's.
export function moduleShape(importPath: string): Shape | null {
  if (Object.hasOwn(PARTLY_OWN_MODULES, importPath)) return PARTLY_OWN_MODULES[importPath];
  if (!OWN_NAMES_IMPORT.test(importPath) || YOUR_VARIABLES_IMPORT.test(importPath)) return null;
  return { anyMember: true, members: MODULE_SHAPES[importPath] };
}

// Is this name, imported from this path, Svelte's or SvelteKit's? If so, it gets
// marked wherever it's used.
export function isOwnImportedName(importPath: string, name: string): boolean {
  return hasMember(moduleShape(importPath), name);
}

// What each kind of SvelteKit file can export, and what each export holds. An
// export only means something special in the right file: `load` in a plain .js
// file is just a function.
// The strings a page option can be are SvelteKit's too, like 'auto' in
// `prerender = 'auto'`. test/svelteNames.test.ts checks them against SvelteKit.
export const PRERENDER = values('auto');
export const TRAILING_SLASH = values('always', 'ignore', 'never');
const PAGE_OPTIONS = { ...plain('config', 'csr', 'entries', 'ssr'), prerender: PRERENDER, trailingSlash: TRAILING_SLASH };
const PAGE_EXPORTS = { ...PAGE_OPTIONS, load: fn(['LoadEvent']) };
const SERVER_PAGE_EXPORTS = { ...PAGE_OPTIONS, load: fn(['ServerLoadEvent']) };

// A function SvelteKit calls with the request, like `GET` or an action.
const HANDLER = fn(['RequestEvent']);

// `actions` can have any names, but `default` is the action a plain form post runs.
const ACTIONS = { members: { default: HANDLER }, anyKey: HANDLER };

const SERVER_EXPORTS = {
  ...plain('config', 'entries'),
  prerender: PRERENDER,
  trailingSlash: TRAILING_SLASH,
  ...Object.fromEntries(
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'QUERY', 'fallback'].map((name) => [name, HANDLER]),
  ),
};

// `handleError` gets a different input in the browser than on the server.
function hookExports(inBrowser: boolean): Record<string, ShapeRef | null> {
  return {
    handle: fn(['HandleInput']),
    handleError: fn([inBrowser ? 'ClientErrorInput' : 'ServerErrorInput'], 'AppError'),
    handleFetch: fn(['HandleFetchInput']),
    init: null,
    reroute: fn(['RerouteInput']),
    transport: { anyKey: 'Transporter' },
  };
}

// <script> attributes that plain HTML doesn't have.
export const SCRIPT_ATTRIBUTES = new Set(['module', 'context', 'generics']);

// Events Svelte fires on an element with a transition, as in onintrostart={go}.
// The web platform has no events by these names.
export const TRANSITION_EVENT = /^on(?:intro|outro)(?:start|end)(?:capture)?$/;

// The values SvelteKit reads from its link options, like `hover` in
// data-sveltekit-preload-data="hover". `olderValues` holds the ones SvelteKit 2
// also read, so links written for it keep their marks. test/svelteNames.test.ts
// checks `values` against SvelteKit's own list.
export const LINK_OPTIONS: Record<string, Shape> = {
  'preload-code': { values: ['eager', 'false', 'hover', 'tap', 'viewport'], olderValues: ['off'] },
  'preload-data': { values: ['false', 'hover', 'tap'], olderValues: ['off'] },
  reload: { values: ['false', 'true'], olderValues: ['off'] },
  replacestate: { values: ['false', 'true'], olderValues: ['off'] },
  reset: { values: ['false', 'true'] },
  keepfocus: { values: [], olderValues: ['false', 'off', 'true'] },
  noscroll: { values: [], olderValues: ['false', 'off', 'true'] },
};

export function linkOption(name: string): Shape | undefined {
  return Object.hasOwn(LINK_OPTIONS, name) ? LINK_OPTIONS[name] : undefined;
}

// The types SvelteKit lets you fill in, inside `namespace App` in src/app.d.ts.
export const APP_TYPES = ['Error', 'Locals', 'PageData', 'PageState', 'Platform'];

export function specialExports(filePath: string, inKitProject = true): Record<string, ShapeRef | null> {
  const name = basename(filePath);
  if (/^\+(page|layout)(@[^.]*)?\.svelte$/.test(name)) return { snapshot: 'Snapshot' };
  if (/^\+page\.server\.[jt]s$/.test(name)) return { ...SERVER_PAGE_EXPORTS, actions: ACTIONS };
  if (/^\+layout\.server\.[jt]s$/.test(name)) return SERVER_PAGE_EXPORTS;
  if (/^\+(page|layout)\.[jt]s$/.test(name)) return PAGE_EXPORTS;
  if (/^\+server\.[jt]s$/.test(name)) return SERVER_EXPORTS;

  // The rest are only known by where they are, and `src/hooks.ts` is an ordinary
  // name outside SvelteKit. Each of these can also be a folder with an index file.
  if (!inKitProject) return {};
  const hooks = filePath.match(/(^|[\\/])src[\\/]hooks(\.server|\.client)?([\\/]index)?\.[jt]s$/);
  if (hooks) return hookExports(hooks[2] === '.client');
  if (/(^|[\\/])src[\\/]params([\\/]index)?\.[jt]s$/.test(filePath)) return { params: null };
  if (/(^|[\\/])src[\\/]params[\\/][^\\/]+\.[jt]s$/.test(filePath)) return { match: null };
  if (/(^|[\\/])src[\\/]env([\\/]index)?\.[jt]s$/.test(filePath)) return { variables: null };
  return {};
}

// The props SvelteKit passes to page, layout and error components. As with exports,
// the file decides: in any other component, `data` is a prop you named yourself.
export function kitProps(filePath: string): Record<string, ShapeRef | null> {
  const name = basename(filePath);
  if (/^\+page(@[^.]*)?\.svelte$/.test(name)) return plain('data', 'form', 'params');
  if (/^\+layout(@[^.]*)?\.svelte$/.test(name)) return plain('data', 'params');
  if (name === '+error.svelte') return { error: 'AppError' };
  return {};
}

// svelte.config.js, which SvelteKit 3 replaced with options in vite.config.js.
export function isSvelteConfig(filePath: string): boolean {
  return /(^|[\\/])svelte\.config\.[cm]?[jt]s$/.test(filePath);
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
const MENTIONS_SVELTE = /svelte|\$app|\$env|\$lib|\$service-worker|#lib|\$types|\bApp\.[A-Z]/;

// SvelteKit's page templates. Any other HTML file is left alone.
export function isKitTemplate(filePath: string): boolean {
  return /(^|[\\/])src[\\/](app|error)\.html$/.test(filePath);
}

export function shouldScan(filePath: string, text: string, inKitProject = true): boolean {
  if (filePath.endsWith('.svelte') || isKitTemplate(filePath) || isSvelteConfig(filePath)) return true;
  if (inKitProject && /(^|[\\/])src[\\/]app\.d\.ts$/.test(filePath)) return true;
  if (!/\.(js|mjs|ts|mts)$/.test(filePath) || filePath.endsWith('.d.ts')) return false;
  if (text.length > LARGEST_SCRIPT_FILE) return false;
  const exports = Object.keys(specialExports(filePath, inKitProject));
  return allowsRunes(filePath) || exports.length > 0 || MENTIONS_SVELTE.test(text);
}
