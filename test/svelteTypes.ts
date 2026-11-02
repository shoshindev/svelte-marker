// The Svelte and SvelteKit types that the shapes in src/svelteNames.ts copy.
// test/svelteNames.test.ts reads each one with TypeScript and checks that the
// shape of the same name lists exactly the same members, so an update that adds
// or renames one fails the test.

import type {
  Cookies as KitCookies,
  LoadEvent as KitLoadEvent,
  NavigationEvent as KitNavigationEvent,
  redirect,
  RequestEvent as KitRequestEvent,
  ServerLoadEvent as KitServerLoadEvent,
  Snapshot as KitSnapshot,
} from '@sveltejs/kit';
import type { EnvVarConfig as KitEnvVarConfig } from '@sveltejs/kit/env';
import type {
  Handle,
  HandleClientError,
  HandleFetch,
  HandleServerError,
  Reroute,
  ResolveOptions as KitResolveOptions,
  Transporter as KitTransporter,
} from '@sveltejs/kit/hooks';
import type { Config } from '@sveltejs/kit/vite';
import type { ActionResult as KitActionResult, SubmitFunction } from '$app/forms';
import type {
  AfterNavigate as KitAfterNavigate,
  BeforeNavigate as KitBeforeNavigate,
  GotoOptions as KitGotoOptions,
  Navigation as KitNavigation,
  NavigationTarget as KitNavigationTarget,
  OnNavigate as KitOnNavigate,
  snapshot,
} from '$app/navigation';
import type { Page as KitPage, updated } from '$app/state';
import type adapterCloudflare from '@sveltejs/adapter-cloudflare';
import type adapterNetlify from '@sveltejs/adapter-netlify';
import type adapterNode from '@sveltejs/adapter-node';
import type adapterStatic from '@sveltejs/adapter-static';
import type adapterVercel from '@sveltejs/adapter-vercel';
import type {
  InspectorOptions as PluginInspectorOptions,
  Options,
  PluginOptions as VitePluginOptions,
  SvelteConfig,
  VitePreprocessOptions as PluginPreprocessOptions,
} from '@sveltejs/vite-plugin-svelte';
import type { createRawSnippet, hydrate, MountOptions as SvelteMountOptions, unmount } from 'svelte';
import type { Warning } from 'svelte/compiler';
import type { ActionReturn as SvelteActionReturn } from 'svelte/action';
import type { AnimationConfig as SvelteAnimationConfig, FlipParams as SvelteFlipParams } from 'svelte/animate';
import type {
  Spring as SvelteSpring,
  SpringOptions as SvelteSpringOptions,
  SpringUpdateOptions as SvelteSpringUpdateOptions,
  Tween as SvelteTween,
  Tweened as SvelteTweened,
  TweenOptions as SvelteTweenOptions,
} from 'svelte/motion';
import type { MediaQuery as SvelteMediaQuery } from 'svelte/reactivity';
import type { fromStore, Readable as SvelteReadable, Writable as SvelteWritable } from 'svelte/store';
import type {
  BlurParams as SvelteBlurParams,
  CrossfadeParams as SvelteCrossfadeParams,
  crossfade,
  DrawParams as SvelteDrawParams,
  FadeParams as SvelteFadeParams,
  FlyParams as SvelteFlyParams,
  ScaleParams as SvelteScaleParams,
  SlideParams as SvelteSlideParams,
  TransitionConfig as SvelteTransitionConfig,
} from 'svelte/transition';

type FirstArgument<F> = F extends (first: infer A, ...rest: any[]) => any ? NonNullable<A> : never;
type ReturnedFunction<F> = Extract<Awaited<ReturnType<Extract<F, (...args: any[]) => any>>>, (...args: any[]) => any>;

// What SvelteKit hands your functions.
export type RequestEvent = KitRequestEvent;
export type ServerLoadEvent = KitServerLoadEvent;
export type LoadEvent = KitLoadEvent;
export type Cookies = KitCookies;
export type Route = KitRequestEvent['route'];
export type Tracing = KitRequestEvent['tracing'];
export type NavigationEvent = KitNavigationEvent;
export type AppError = App.Error;
export type RedirectOptions = NonNullable<Parameters<typeof redirect>[2]>;

// Hooks.
export type HandleInput = FirstArgument<Handle>;
export type ResolveOptions = KitResolveOptions;
export type PageChunk = FirstArgument<KitResolveOptions['transformPageChunk']>;
export type PreloadInput = FirstArgument<KitResolveOptions['preload']>;
export type HandleFetchInput = FirstArgument<HandleFetch>;
export type ServerErrorInput = FirstArgument<HandleServerError>;
export type ClientErrorInput = FirstArgument<HandleClientError>;
export type RerouteInput = FirstArgument<Reroute>;
export type Transporter = KitTransporter;
export type EnvVarConfig = KitEnvVarConfig<any>;

// Pages and navigation.
export type Snapshot = KitSnapshot;
export type SnapshotOptions = FirstArgument<typeof snapshot>;
export type Page = KitPage;
export type ShallowPage = NonNullable<KitPage['shallow']>;
export type Updated = typeof updated;
export type GotoOptions = KitGotoOptions;
export type NavigationTarget = KitNavigationTarget;
export type ScrollPosition = NonNullable<KitNavigationTarget['scroll']>;
export type Navigation = KitNavigation;
export type BeforeNavigate = KitBeforeNavigate;
export type AfterNavigate = KitAfterNavigate;
export type OnNavigate = KitOnNavigate;

// Forms.
export type SubmitInput = FirstArgument<SubmitFunction>;
export type SubmitResultInput = FirstArgument<ReturnedFunction<SubmitFunction>>;
export type UpdateOptions = FirstArgument<SubmitResultInput['update']>;
export type ActionResult = KitActionResult;

// SvelteKit's options, passed to sveltekit() in vite.config.js.
export type KitConfig = Config;
export type KitCsp = NonNullable<Config['csp']>;
export type KitCsrf = NonNullable<Config['csrf']>;
export type KitEnv = NonNullable<Config['env']>;
export type KitExperimental = NonNullable<Config['experimental']>;
export type KitFiles = NonNullable<Config['files']>;
export type KitHookFiles = NonNullable<KitFiles['hooks']>;
export type KitOutput = NonNullable<Config['output']>;
export type KitPaths = NonNullable<Config['paths']>;
export type KitPrerender = NonNullable<Config['prerender']>;
export type PrerenderHttpError = FirstArgument<KitPrerender['handleHttpError']>;
export type PrerenderMissingId = FirstArgument<KitPrerender['handleMissingId']>;
export type PrerenderEntryMismatch = FirstArgument<KitPrerender['handleEntryGeneratorMismatch']>;
export type PrerenderUnseenRoutes = FirstArgument<KitPrerender['handleUnseenRoutes']>;
export type PrerenderInvalidUrl = FirstArgument<KitPrerender['handleInvalidUrl']>;
export type KitRouter = NonNullable<Config['router']>;
export type KitServiceWorker = Extract<NonNullable<Config['serviceWorker']>, object>;
export type KitTracing = NonNullable<Config['tracing']>;
export type KitTypescript = NonNullable<Config['typescript']>;
export type KitVersion = NonNullable<Config['version']>;

// svelte.config.js. SvelteKit 2 read its options from a `kit` key there.
// SvelteKit 3 dropped the file, so its own options are the closest match.
export type LegacySvelteConfig = SvelteConfig & { kit?: Config };
export type PluginOptions = VitePluginOptions;
export type SveltePluginOptions = Options;
export type PluginExperimental = NonNullable<VitePluginOptions['experimental']>;
export type CompileModuleOptions = NonNullable<PluginExperimental['compileModule']>;
export type DynamicCompileInput = FirstArgument<VitePluginOptions['dynamicCompileOptions']>;
export type InspectorOptions = PluginInspectorOptions;
export type InspectorKeys = NonNullable<PluginInspectorOptions['navKeys']>;
export type VitePreprocessOptions = PluginPreprocessOptions;
export type CompilerOptions = NonNullable<SvelteConfig['compilerOptions']>;
export type CompilerExperimental = NonNullable<CompilerOptions['experimental']>;
export type CompilerCompatibility = NonNullable<CompilerOptions['compatibility']>;
export type CompilerFile = FirstArgument<CompilerOptions['runes']>;
export type CssHashInput = FirstArgument<CompilerOptions['cssHash']>;
export type CompilerWarning = Warning;

// The official adapters.
export type AdapterCloudflareOptions = FirstArgument<typeof adapterCloudflare>;
export type AdapterNetlifyOptions = FirstArgument<typeof adapterNetlify>;
export type AdapterNodeOptions = FirstArgument<typeof adapterNode>;
export type AdapterStaticOptions = FirstArgument<typeof adapterStatic>;
export type AdapterVercelOptions = FirstArgument<typeof adapterVercel>;
export type CloudflareRoutes = NonNullable<AdapterCloudflareOptions['routes']>;
export type VercelIsr = Extract<AdapterVercelOptions['isr'], object>;

// Svelte.
export type MountOptions = SvelteMountOptions;
export type HydrateOptions = NonNullable<Parameters<typeof hydrate>[1]>;
export type UnmountOptions = NonNullable<Parameters<typeof unmount>[1]>;
export type RawSnippet = ReturnType<FirstArgument<typeof createRawSnippet>>;
export type ActionReturn = SvelteActionReturn;
export type TransitionConfig = SvelteTransitionConfig;
export type AnimationConfig = SvelteAnimationConfig;
export type BlurParams = SvelteBlurParams;
export type CrossfadeOptions = FirstArgument<typeof crossfade>;
export type CrossfadeParams = SvelteCrossfadeParams & { key: any };
export type DrawParams = SvelteDrawParams;
export type FadeParams = SvelteFadeParams;
export type FlyParams = SvelteFlyParams;
export type ScaleParams = SvelteScaleParams;
export type SlideParams = SvelteSlideParams;
export type FlipParams = SvelteFlipParams;
export type TweenOptions = SvelteTweenOptions<any>;
export type Tween = SvelteTween<any>;
export type TweenClass = typeof SvelteTween;
export type Tweened = SvelteTweened<any>;
export type SpringOptions = SvelteSpringOptions;
export type SpringUpdateOptions = SvelteSpringUpdateOptions;
export type Spring = SvelteSpring<any>;
export type SpringClass = typeof SvelteSpring;
export type MediaQuery = SvelteMediaQuery;
export type Readable = SvelteReadable<any>;
export type Writable = SvelteWritable<any>;
export type FromStore = ReturnType<typeof fromStore>;
