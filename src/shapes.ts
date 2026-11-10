// What Svelte's and SvelteKit's values hold. When you take `{ params }` from a
// load event, or read `event.locals`, these lists say which names are Svelte's,
// and what each one holds in turn.
//
// test/svelteTypes.ts pairs each shape here with the Svelte or SvelteKit type it
// copies, and test/svelteNames.test.ts checks that the names match. The rest,
// mostly for tools built on Svelte, are generated into src/generatedShapes.ts.

import { GENERATED_MODULES, GENERATED_SHAPES } from './generatedShapes.ts';

// A shape is either a name in SHAPES or written out in place.
export type ShapeRef = string | Shape;

export interface Shape {
  // The names Svelte fixes, each with the shape of what it holds, or null when
  // that's a plain value or something of yours, like a URL or your page data.
  members?: Record<string, ShapeRef | null>;
  // Names from older versions that the current types no longer have.
  older?: string[];
  // In an object like `actions`, where the keys are yours, the shape of each value.
  anyKey?: ShapeRef;
  // Every member is Svelte's, as in `import * as kit from '@sveltejs/kit'`.
  anyMember?: boolean;
  // A function: the shape of each argument, whoever writes the function. For
  // `goto(url, options)` you write them, and for `load(event)` SvelteKit does.
  args?: (ShapeRef | null)[];
  // What a function returns, or what `new` makes.
  returns?: ShapeRef;
  // What each item holds, like each of the pair that `crossfade()` returns.
  items?: ShapeRef;
  // What `$store` holds, for a store.
  value?: ShapeRef;
  // The strings it can be, whose text Svelte fixes, like 'success' for the
  // `type` of a form result.
  values?: string[];
  // Strings from older versions that the current ones no longer allow, like
  // 'off' for a link option, which SvelteKit 2 read.
  olderValues?: string[];
}

// A function with these arguments, and what it returns.
export function fn(args: (ShapeRef | null)[], returns?: ShapeRef): Shape {
  return returns ? { args, returns } : { args };
}

// A string that can only be one of these.
export function values(...items: string[]): Shape {
  return { values: items };
}

export function resolveShape(ref: ShapeRef | null | undefined): Shape | null {
  return typeof ref === 'string' ? (SHAPES[ref] ?? null) : (ref ?? null);
}

// Is this one of the names Svelte fixes on a value of this shape?
export function hasMember(shape: Shape | null | undefined, name: string | undefined): boolean {
  if (!shape || name === undefined) return false;
  return Boolean(shape.anyMember) || Object.hasOwn(shape.members ?? {}, name) || Boolean(shape.older?.includes(name));
}

// Is this one of the strings Svelte fixes for a value of this shape?
export function hasValue(shape: Shape | null | undefined, text: string): boolean {
  return Boolean(shape?.values?.includes(text) || shape?.olderValues?.includes(text));
}

// What <svelte:options> takes, in the syntax tree that parse() returns.
export const SVELTE_OPTIONS = 'svelte/compiler.AST.SvelteOptions';

// Members that hold plain values.
export function plain(...names: string[]): Record<string, null> {
  return Object.fromEntries(names.map((name) => [name, null]));
}

// A transition takes the element first, then its options. You can call one
// yourself, to change what it returns.
function transition(options: string): Shape {
  return fn([null, options], 'TransitionConfig');
}

// What a navigation holds. Its `type` says how it started, and each kind of
// callback sees a different set of those.
const NAVIGATION = {
  ...plain('complete', 'delta', 'event', 'shallow', 'willUnload'),
  from: 'NavigationTarget',
  to: 'NavigationTarget',
};
const NAVIGATION_TYPE = values('form', 'goto', 'leave', 'link', 'popstate');

const REQUEST_EVENT = {
  ...plain(
    'fetch',
    'getClientAddress',
    'isDataRequest',
    'isRemoteRequest',
    'isSubRequest',
    'locals',
    'params',
    'platform',
    'request',
    'setHeaders',
    'url',
  ),
  cookies: 'Cookies',
  route: 'Route',
  tracing: 'Tracing',
};

// The options svelte.config.js holds, which SvelteKit 3 takes in vite.config.js.
// `onwarn` gets Svelte's own handler too, to pass the warning on to.
const SVELTE_CONFIG = {
  extensions: null,
  compilerOptions: 'CompilerOptions',
  onwarn: fn(['CompilerWarning', fn(['CompilerWarning'])]),
  preprocess: 'Preprocessors',
};

// The options of vite-plugin-svelte, which runs Svelte inside Vite.
const PLUGIN_OPTIONS = {
  ...plain('disableDependencyReinclusion', 'emitCss', 'exclude', 'include', 'prebundleSvelteLibraries'),
  dynamicCompileOptions: fn(['DynamicCompileInput'], 'CompileOptions'),
  inspector: 'InspectorOptions',
};

const TRANSITION_CONFIG = plain('css', 'delay', 'duration', 'easing', 'tick');

// What SvelteKit does about a problem while prerendering: one of these, or your
// function decides.
function prerenderHandler(input: string): Shape {
  return { ...fn([input]), ...values('fail', 'ignore', 'warn') };
}

// Whether the compiler puts a component's CSS in its JS or in a file of its own.
// A function can decide that per file.
const CSS_OUTPUT = values('external', 'injected');

// The shapes written by hand.
export const HAND_SHAPES: Record<string, Shape> = {
  // What SvelteKit hands your functions.
  RequestEvent: { members: REQUEST_EVENT },
  ServerLoadEvent: { members: { ...REQUEST_EVENT, ...plain('depends', 'parent', 'untrack') } },
  LoadEvent: {
    members: {
      ...plain('data', 'depends', 'fetch', 'params', 'parent', 'setHeaders', 'untrack', 'url'),
      route: 'Route',
      tracing: 'Tracing',
    },
  },
  Cookies: {
    members: { ...plain('delete', 'get', 'parse', 'serialize', 'set'), getAll: fn([], { items: 'CookieItem' }) },
  },
  CookieItem: { members: plain('name', 'value') },
  Route: { members: plain('id') },
  Tracing: { members: plain('current', 'enabled', 'root') },
  NavigationEvent: { members: { ...plain('params', 'url'), route: 'Route' } },
  AppError: { members: plain('message', 'status') },
  RedirectOptions: { members: plain('external') },

  // Hooks.
  HandleInput: { members: { event: 'RequestEvent', resolve: fn([null, 'ResolveOptions']) } },
  ResolveOptions: {
    members: {
      filterSerializedResponseHeaders: null,
      preload: fn(['PreloadInput']),
      transformPageChunk: fn(['PageChunk']),
    },
  },
  PageChunk: { members: plain('done', 'html') },
  PreloadInput: { members: { ...plain('filename', 'path'), type: values('asset', 'css', 'font', 'js') } },
  HandleFetchInput: { members: { ...plain('fetch', 'request'), event: 'RequestEvent' } },
  ServerErrorInput: {
    members: {
      ...plain('error', 'issues'),
      event: 'RequestEvent',
      kind: values('app', 'framework', 'unknown', 'validation'),
    },
    older: ['message', 'status'],
  },
  ClientErrorInput: {
    members: { ...plain('error', 'issues'), event: 'NavigationEvent', kind: values('app', 'framework', 'unknown') },
    older: ['message', 'status'],
  },
  RerouteInput: { members: plain('fetch', 'url') },
  Transporter: { members: plain('decode', 'encode') },
  EnvVarConfig: { members: plain('description', 'public', 'schema', 'static') },

  // Pages and navigation.
  Snapshot: { members: plain('capture', 'restore') },
  SnapshotOptions: { members: plain('capture', 'id', 'reset', 'restore') },
  Page: {
    members: {
      ...plain('data', 'form', 'params', 'state', 'status', 'url'),
      error: 'AppError',
      route: 'Route',
      shallow: 'ShallowPage',
    },
  },
  ShallowPage: { members: { ...plain('params', 'url'), route: 'Route' } },
  Updated: { members: plain('check', 'current') },
  GotoOptions: {
    members: plain(
      'invalidate',
      'invalidateAll',
      'persistState',
      'refreshAll',
      'replace',
      'replaceState',
      'reset',
      'shallow',
      'state',
    ),
    older: ['keepFocus', 'noScroll'],
  },
  NavigationTarget: { members: { ...plain('params', 'url'), route: 'Route', scroll: 'ScrollPosition' } },
  ScrollPosition: { members: plain('x', 'y') },
  Navigation: { members: { ...NAVIGATION, type: NAVIGATION_TYPE } },
  BeforeNavigate: { members: { ...NAVIGATION, cancel: null, type: NAVIGATION_TYPE } },
  AfterNavigate: { members: { ...NAVIGATION, type: values('enter', 'form', 'goto', 'link', 'popstate') } },
  OnNavigate: { members: { ...NAVIGATION, type: values('form', 'goto', 'link', 'popstate') } },

  // Forms.
  SubmitInput: { members: plain('action', 'cancel', 'controller', 'formData', 'formElement', 'submitter') },
  SubmitResultInput: {
    members: {
      ...plain('action', 'formData', 'formElement'),
      result: 'ActionResult',
      update: fn(['UpdateOptions']),
    },
  },
  UpdateOptions: { members: plain('invalidateAll', 'navigate', 'refreshAll', 'reset') },
  ActionResult: {
    members: { ...plain('data', 'error', 'location', 'status'), type: values('error', 'failure', 'redirect', 'success') },
  },

  // SvelteKit's options, passed to sveltekit() in vite.config.js.
  KitConfig: {
    members: {
      ...SVELTE_CONFIG,
      ...PLUGIN_OPTIONS,
      ...plain('alias', 'appDir', 'configFile', 'embedded', 'inlineStyleThreshold'),
      ...plain('moduleExtensions', 'outDir'),
      adapter: 'Adapter',
      csp: 'KitCsp',
      csrf: 'KitCsrf',
      env: 'KitEnv',
      experimental: 'KitExperimental',
      files: 'KitFiles',
      output: 'KitOutput',
      paths: 'KitPaths',
      prerender: 'KitPrerender',
      router: 'KitRouter',
      serviceWorker: 'KitServiceWorker',
      tracing: 'KitTracing',
      typescript: 'KitTypescript',
      version: 'KitVersion',
    },
  },
  KitCsp: { members: { ...plain('directives', 'reportOnly'), mode: values('auto', 'hash', 'nonce') } },
  KitCsrf: { members: plain('checkOrigin', 'trustedOrigins') },
  KitEnv: { members: plain('dir'), older: ['privatePrefix', 'publicPrefix'] },
  KitExperimental: {
    members: {
      ...plain('disableSvelteResolveWarnings', 'forkPreloads', 'remoteFunctions', 'sendWarningsToBrowser'),
      compileModule: 'CompileModuleOptions',
    },
  },
  KitFiles: {
    members: {
      ...plain('appTemplate', 'assets', 'errorTemplate', 'params', 'routes', 'serviceWorker', 'src'),
      hooks: 'KitHookFiles',
    },
    older: ['lib'],
  },
  KitHookFiles: { members: plain('client', 'server', 'universal') },
  KitOutput: {
    members: {
      linkHeaderPreload: null,
      bundleStrategy: values('inline', 'single', 'split'),
      preloadStrategy: values('modulepreload', 'preload-js', 'preload-mjs'),
    },
  },
  KitPaths: { members: plain('assets', 'base', 'origin', 'relative') },
  KitPrerender: {
    members: {
      ...plain('concurrency', 'crawl', 'entries'),
      handleEntryGeneratorMismatch: prerenderHandler('PrerenderEntryMismatch'),
      handleHttpError: prerenderHandler('PrerenderHttpError'),
      handleInvalidUrl: prerenderHandler('PrerenderInvalidUrl'),
      handleMissingId: prerenderHandler('PrerenderMissingId'),
      handleUnseenRoutes: prerenderHandler('PrerenderUnseenRoutes'),
    },
    older: ['origin'],
  },
  PrerenderHttpError: {
    members: { ...plain('message', 'path', 'referrer', 'status'), referenceType: values('fetched', 'linked') },
  },
  PrerenderMissingId: { members: plain('id', 'message', 'path', 'referrers') },
  PrerenderEntryMismatch: { members: plain('entry', 'generatedFromId', 'matchedId', 'message') },
  PrerenderUnseenRoutes: { members: plain('message', 'routes') },
  PrerenderInvalidUrl: { members: plain('href', 'message', 'referrer') },
  KitRouter: { members: { resolution: values('client', 'server'), type: values('hash', 'pathname') } },
  KitServiceWorker: { members: plain('options', 'register'), older: ['files'] },
  KitTracing: { members: plain('server') },
  KitTypescript: { members: plain('config') },
  KitVersion: { members: plain('name', 'pollInterval') },

  // svelte.config.js, and the options of vite-plugin-svelte.
  LegacySvelteConfig: { members: { ...SVELTE_CONFIG, kit: 'KitConfig', vitePlugin: 'PluginOptions' } },
  PluginOptions: { members: { ...PLUGIN_OPTIONS, experimental: 'PluginExperimental' } },
  SveltePluginOptions: {
    members: { ...SVELTE_CONFIG, ...PLUGIN_OPTIONS, configFile: null, experimental: 'PluginExperimental' },
  },
  PluginExperimental: {
    members: {
      ...plain('disableSvelteResolveWarnings', 'sendWarningsToBrowser'),
      compileModule: 'CompileModuleOptions',
    },
  },
  CompileModuleOptions: { members: plain('exclude', 'extensions', 'include', 'infixes') },
  DynamicCompileInput: { members: { ...plain('code', 'environment', 'filename'), compileOptions: 'CompileOptions' } },
  InspectorOptions: {
    members: {
      ...plain('customStyles', 'escapeKeys', 'holdMode', 'openKey', 'openMenuKey', 'toggleKeyCombo'),
      navKeys: 'InspectorKeys',
      showToggleButton: values('active', 'always', 'never'),
      toggleButtonPos: values('bottom-left', 'bottom-right', 'top-left', 'top-right'),
    },
  },
  InspectorKeys: { members: plain('child', 'next', 'parent', 'prev') },
  VitePreprocessOptions: { members: plain('script', 'style') },
  CompilerOptions: {
    members: {
      ...plain('accessors', 'cssOutputFilename', 'dev', 'discloseVersion', 'hmr', 'immutable', 'modernAst'),
      ...plain('name', 'outputFilename', 'preserveComments', 'preserveWhitespace', 'rootDir', 'sourcemap'),
      compatibility: 'CompilerCompatibility',
      css: { ...fn(['CompilerFile'], CSS_OUTPUT), ...CSS_OUTPUT },
      fragments: values('html', 'tree'),
      namespace: values('html', 'mathml', 'svg'),
      cssHash: fn(['CssHashInput']),
      customElement: fn(['CompilerFile']),
      experimental: 'CompilerExperimental',
      runes: fn(['CompilerFile']),
      warningFilter: fn(['CompilerWarning']),
    },
  },
  CompilerExperimental: { members: plain('async') },
  CompilerCompatibility: { members: plain('componentApi') },
  CompilerFile: { members: plain('filename') },
  CssHashInput: { members: plain('css', 'filename', 'hash', 'name') },
  CompilerWarning: { members: plain('code', 'end', 'filename', 'frame', 'message', 'position', 'stack', 'start') },

  // The official adapters.
  AdapterCloudflareOptions: {
    members: { ...plain('config', 'platformProxy'), fallback: values('plaintext', 'spa'), routes: 'CloudflareRoutes' },
  },
  CloudflareRoutes: { members: plain('exclude', 'include') },
  AdapterNetlifyOptions: { members: plain('edge', 'publish', 'split') },
  AdapterNodeOptions: { members: plain('envPrefix', 'out', 'precompress') },
  AdapterStaticOptions: { members: plain('assets', 'fallback', 'pages', 'precompress', 'strict') },
  AdapterVercelOptions: {
    members: { ...plain('images', 'maxDuration', 'memory', 'regions', 'runtime', 'split'), isr: 'VercelIsr' },
  },
  VercelIsr: { members: plain('allowQuery', 'bypassToken', 'expiration') },

  // Svelte.
  InspectResult: { members: { with: fn([fn([values('init', 'update')])]) } },
  MountOptions: { members: plain('anchor', 'context', 'events', 'intro', 'props', 'target', 'transformError') },
  HydrateOptions: { members: plain('context', 'events', 'intro', 'props', 'recover', 'target', 'transformError') },
  UnmountOptions: { members: plain('outro') },
  RawSnippet: { members: plain('render', 'setup') },
  ActionReturn: { members: plain('destroy', 'update') },
  TransitionConfig: { members: TRANSITION_CONFIG },
  AnimationConfig: { members: TRANSITION_CONFIG },
  AnimationPositions: { members: plain('from', 'to') },
  BlurParams: { members: plain('amount', 'delay', 'duration', 'easing', 'opacity') },
  CrossfadeOptions: {
    members: {
      ...plain('delay', 'duration', 'easing'),
      fallback: fn([null, 'CrossfadeParams', null], 'TransitionConfig'),
    },
  },
  CrossfadeParams: { members: plain('delay', 'duration', 'easing', 'key') },
  DrawParams: { members: plain('delay', 'duration', 'easing', 'speed') },
  FadeParams: { members: plain('delay', 'duration', 'easing') },
  FlyParams: { members: plain('delay', 'duration', 'easing', 'opacity', 'x', 'y') },
  ScaleParams: { members: plain('delay', 'duration', 'easing', 'opacity', 'start') },
  SlideParams: { members: { ...plain('delay', 'duration', 'easing'), axis: values('x', 'y') } },
  FlipParams: { members: plain('delay', 'duration', 'easing') },
  TweenOptions: { members: plain('delay', 'duration', 'easing', 'interpolate') },
  Tween: { members: { ...plain('current', 'target'), set: fn([null, 'TweenOptions']) } },
  TweenClass: { members: { of: fn([null, 'TweenOptions'], 'Tween') }, args: [null, 'TweenOptions'], returns: 'Tween' },
  Tweened: { members: { subscribe: null, set: fn([null, 'TweenOptions']), update: fn([null, 'TweenOptions']) } },
  SpringOptions: { members: plain('damping', 'precision', 'stiffness') },
  SpringUpdateOptions: { members: plain('hard', 'instant', 'preserveMomentum', 'soft') },
  Spring: {
    members: {
      ...plain('current', 'damping', 'precision', 'stiffness', 'subscribe', 'target'),
      set: fn([null, 'SpringUpdateOptions']),
      update: fn([null, 'SpringUpdateOptions']),
    },
  },
  SpringClass: { members: { of: fn([null, 'SpringOptions'], 'Spring') }, args: [null, 'SpringOptions'], returns: 'Spring' },
  MediaQuery: { members: plain('current') },
  Readable: { members: plain('subscribe') },
  Writable: { members: plain('set', 'subscribe', 'update') },
  FromStore: { members: plain('current') },
};

// What each module's exports hold, for the ones that hold more than a name.
export const HAND_MODULE_SHAPES: Record<string, Record<string, ShapeRef>> = {
  svelte: {
    createRawSnippet: fn([fn([], 'RawSnippet')]),
    hydrate: fn([null, 'HydrateOptions']),
    mount: fn([null, 'MountOptions']),
    unmount: fn([null, 'UnmountOptions']),
  },
  'svelte/animate': { flip: fn([null, 'AnimationPositions', 'FlipParams'], 'AnimationConfig') },
  'svelte/motion': {
    prefersReducedMotion: 'MediaQuery',
    Spring: 'SpringClass',
    spring: fn([null, 'SpringOptions'], 'Spring'),
    Tween: 'TweenClass',
    tweened: fn([null, 'TweenOptions'], 'Tweened'),
  },
  'svelte/reactivity': { MediaQuery: fn([], 'MediaQuery') },
  'svelte/store': {
    derived: fn([], 'Readable'),
    fromStore: fn([], 'FromStore'),
    readable: fn([], 'Readable'),
    readonly: fn([], 'Readable'),
    toStore: fn([], 'Writable'),
    writable: fn([], 'Writable'),
  },
  'svelte/transition': {
    blur: transition('BlurParams'),
    // The pair crossfade() returns gives back a function that makes the transition.
    crossfade: fn(['CrossfadeOptions'], { items: fn([null, 'CrossfadeParams'], fn([], 'TransitionConfig')) }),
    draw: transition('DrawParams'),
    fade: transition('FadeParams'),
    fly: transition('FlyParams'),
    scale: transition('ScaleParams'),
    slide: transition('SlideParams'),
  },
  '@sveltejs/kit': {
    error: fn([null, 'AppError']),
    redirect: fn([null, null, 'RedirectOptions']),
  },
  '@sveltejs/kit/env': { defineEnvVars: fn([{ anyKey: 'EnvVarConfig' }]) },
  '@sveltejs/kit/vite': { sveltekit: fn(['KitConfig']) },
  '@sveltejs/vite-plugin-svelte': {
    svelte: fn(['SveltePluginOptions']),
    vitePreprocess: fn(['VitePreprocessOptions'], 'Preprocessors'),
  },
  '@sveltejs/adapter-cloudflare': { default: fn(['AdapterCloudflareOptions'], 'Adapter') },
  '@sveltejs/adapter-netlify': { default: fn(['AdapterNetlifyOptions'], 'Adapter') },
  '@sveltejs/adapter-node': { default: fn(['AdapterNodeOptions'], 'Adapter') },
  '@sveltejs/adapter-static': { default: fn(['AdapterStaticOptions'], 'Adapter') },
  '@sveltejs/adapter-vercel': { default: fn(['AdapterVercelOptions'], 'Adapter') },
  '$app/forms': {
    enhance: fn([null, fn(['SubmitInput'], fn(['SubmitResultInput']))], { members: plain('destroy') }),
  },
  '$app/navigation': {
    afterNavigate: fn([fn(['AfterNavigate'])]),
    beforeNavigate: fn([fn(['BeforeNavigate'])]),
    goto: fn([null, 'GotoOptions']),
    onNavigate: fn([fn(['OnNavigate'])]),
    snapshot: fn(['SnapshotOptions']),
  },
  '$app/server': { getRequestEvent: fn([], 'RequestEvent') },
  '$app/state': { navigating: 'Navigation', page: 'Page', updated: 'Updated' },
  // SvelteKit 2's stores. `$page` holds what `page` from $app/state does.
  '$app/stores': {
    navigating: { members: plain('subscribe'), value: 'Navigation' },
    page: { members: plain('subscribe'), value: 'Page' },
    updated: { members: plain('check', 'subscribe') },
  },
};

export const SHAPES: Record<string, Shape> = { ...GENERATED_SHAPES, ...HAND_SHAPES };

export const MODULE_SHAPES: Record<string, Record<string, ShapeRef>> = Object.fromEntries(
  [...new Set([...Object.keys(GENERATED_MODULES), ...Object.keys(HAND_MODULE_SHAPES)])].map((path) => [
    path,
    { ...GENERATED_MODULES[path], ...HAND_MODULE_SHAPES[path] },
  ]),
);

// Your own action, transition or animation returns an object Svelte reads.
export const OWN_DIRECTIVES: Record<string, Shape> = {
  UseDirective: fn([], 'ActionReturn'),
  TransitionDirective: fn([], 'TransitionConfig'),
  AnimateDirective: fn([], 'AnimationConfig'),
};
