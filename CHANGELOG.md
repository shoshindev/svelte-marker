# Changelog

## 0.0.9 (2026-11-10)

- Works in Restricted Mode, which VS Code uses for folders you haven't marked as trusted. The extension only reads your files and never runs code from them, so it doesn't need that trust.
- New icon: an S with a violet highlighter swipe, in the color of the marks.

## 0.0.8 (2026-11-10)

- Your variables in `$env/dynamic/private` and `$env/dynamic/public` stay unmarked however you import them. Before, `import * as`, `await import()`, JSDoc and `typeof import()` marked them.
- Link options like `data-sveltekit-preload-data` get marks only in a SvelteKit project.
- Marks `remote` in `handleError`, which SvelteKit 3.2 added.

## 0.0.7 (2026-11-06)

- Marks the text of strings Svelte fixes, like `auto` in `prerender = 'auto'` and `success` in `result.type === 'success'`.
- Marks the whole of a fixed import path like `$app/forms`, but only the placeholder in `$lib/utils` and `./$types`.
- Marks `await` at the top of a component's script and in `$derived(...)`, transition events like `onintrostart`, and `env` from `$env/dynamic/*`.
- Leaves the key in `{#each a as b (b.id)}` unmarked, apart from its `()`.

## 0.0.6 (2026-11-02)

- Covers every name in Svelte's and SvelteKit's exports, including the compiler's options and syntax tree, preprocessors and the Adapter API.
- Marks what remote functions from a `.remote.ts` file hold, like `current`, `loading`, `fields` and `pending`.

## 0.0.5 (2026-11-02)

- Follows Svelte's values through a file and marks the names Svelte fixes on them, like `locals` in `event.locals` and `url` in `page.url`.
- Marks the option keys Svelte reads, like `replaceState` in `goto()`, and the keys in `svelte.config.js`.
- Marks `?/` in form actions.
- Stops marking names you choose, like `go` in `{ redirect as go }`.
- Renames the command to Svelte Marker: Toggle Marks.

## 0.0.4 (2026-11-01)

- Changes the marks to violet, and lets you set your own color in `workbench.colorCustomizations`.
- Installs Svelte for VS Code along with it, because `.svelte` files get no marks without it.
- Marks the brackets that belong to Svelte syntax, the names a tag creates like `as goal`, and fixed props like `children` and `data`.
- Marks Svelte's names inside TypeScript, like `Snippet`, `PageLoad` and `App.Locals`.
- Fixes wrong and missing marks found by running it over real projects.

## 0.0.3 (2026-10-31)

- Marks everything that isn't plain JS, HTML or CSS, like expression braces, components, stores, legacy syntax, `:global` and the placeholders in `app.html`.

## 0.0.2 (2026-10-30)

- Marks SvelteKit syntax in JS and TS files, like special exports such as `load`, the values SvelteKit passes to them, and names imported from Svelte or SvelteKit.

## 0.0.1 (2026-10-30)

- First version. Marks Svelte syntax in `.svelte` files, with a command to turn the marks off.
