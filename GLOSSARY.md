# Svelte Marker

A VS Code extension that puts a mark behind Svelte syntax and Svelte names, so you can tell them apart from plain JS, HTML and CSS.

## Language

### What gets a mark

**Mark**:
A translucent background behind a piece of text.
_Avoid_: highlight, decoration

**Svelte**:
Svelte, SvelteKit, and the packages published under `@sveltejs/`. A community package like `svelte-sonner` isn't Svelte.

**Svelte syntax**:
Text that plain JS, HTML or CSS couldn't read, or would read differently, like `{#if`, `$count` and `goal (goal.id)`.

**Svelte name**:
A name whose spelling Svelte fixes, so renaming it breaks the code, like `load`, `data` in `+page.svelte`, `$lib` and `Snippet`.
_Avoid_: own name, Svelte-only name, special name

**Fixed value**:
A string whose text Svelte fixes, like `'auto'` in `prerender = 'auto'` or `hover` in `data-sveltekit-preload-data="hover"`. Its text gets a mark, and its quotes don't.
_Avoid_: literal, enum value

**Your name**:
A name whose spelling you choose, like a variable, an import alias or a route parameter, even when it holds a Svelte value.
_Avoid_: own name

### Kinds of Svelte name

**Special export**:
An export whose name SvelteKit gives a meaning in that kind of file, like `load` in `+page.ts` or `handle` in `src/hooks.server.ts`.

**Fixed prop**:
A prop that Svelte or SvelteKit passes to a component, like `children`, or `data` in `+page.svelte`.

**Provided value**:
A value Svelte or SvelteKit passes to a function of yours that it calls, like `params` in `load({ params })` or `to` in `beforeNavigate(({ to }) => ...)`.

**Fixed key**:
An object key whose name Svelte fixes, like `default` in `actions`, `duration` in a transition's options or `kit` in `svelte.config.js`.

### Projects

**SvelteKit project**:
The package a file belongs to when its nearest `package.json` lists `@sveltejs/kit`, or when there's no `package.json` in any folder above it.
