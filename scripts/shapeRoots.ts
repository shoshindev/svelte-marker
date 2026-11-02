// The types scripts/generateShapes.ts starts from besides the exports of each
// module, because src/shapes.ts points at them by these names.

import type { Adapter as KitAdapter } from '@sveltejs/kit';
import type { SvelteConfig } from '@sveltejs/vite-plugin-svelte';
import type { command, form, prerender, query } from '$app/server';
import type { SvelteComponent } from 'svelte';
import type { CompileOptions as SvelteCompileOptions } from 'svelte/compiler';

// What a custom adapter, or the one an adapter package returns, holds.
export type Adapter = KitAdapter;

// The options of compile(), which dynamicCompileOptions in svelte.config.js
// receives and returns.
export type CompileOptions = SvelteCompileOptions;

// One preprocessor, or a list of them, as svelte.config.js takes them.
export type Preprocessors = NonNullable<SvelteConfig['preprocess']>;

// Whatever a .remote.ts file exports: it can be any kind of remote function, and
// another file can't tell which.
export type RemoteExport =
  | ReturnType<typeof query>
  | ReturnType<typeof form>
  | ReturnType<typeof command>
  | ReturnType<typeof prerender>;

// A component imported from a .svelte file, as Svelte 4 code uses it with `new`.
export type LegacyComponent = typeof SvelteComponent;
