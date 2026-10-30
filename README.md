# Svelte Marker

Paints a translucent orange highlighter mark behind Svelte and SvelteKit syntax in `.svelte`, `.js` and `.ts` files, so you can tell it apart from plain HTML, JS and CSS at a glance. It only adds a background, so your theme's text colors stay the same and it works with any color theme.

Turn it on and off with **Svelte Marker: Toggle Highlighting** in the Command Palette. The setting survives restarts.

For `.svelte` files it needs [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode), because that's what tells VS Code a `.svelte` file is Svelte.

## What gets marked

| Group | Examples |
|---|---|
| Runes | `$state`, `$derived.by`, `$effect.pre`, `$props.id`, `$inspect(...).with` |
| Blocks and tags | `{#if`, `{:else}`, `{/if}`, `{@render`, `{@attach`, `{let`, `{const` |
| Directives | `bind:value`, `class:active`, `use:tooltip`, `transition:fade\|global`, legacy `on:click` |
| Special elements | `svelte:head`, `svelte:window`, `svelte:boundary`, legacy `svelte:self` |
| Imports | `svelte`, `svelte/*`, `$app/*`, `$env/*`, `$lib`, `#lib`, `$service-worker`, `@sveltejs/kit`, `./$types` |
| Imported names | `onMount`, `fade`, `redirect`, `error`, `fail`, `goto`, `page`, wherever they're used |
| Special exports | `load`, `actions`, `prerender`, `GET`, `POST`, `handle`, `match`, only in the file types where they mean something |
| Provided values | `params`, `url`, `cookies`, `request`, where they're listed, as in `load({ params })` |
| Link options | `data-sveltekit-preload-data`, `data-sveltekit-reload` |

The JS inside a block stays unmarked: in `{#if count > 0}`, only `{#if` and `}` get a mark. Plain attributes like `onclick` stay unmarked too.

Some names stay unmarked on purpose. Names from `$lib`, `#lib`, `$env/*` and `$app/env/public` are your own code and variables, so only the import path gets a mark. A local variable that shares a name with an import, like `error` in `catch (error)`, stays unmarked too.

Runes are marked in `.svelte`, `.svelte.js` and `.svelte.ts` files only, because `$state()` is an ordinary function call anywhere else.

These are Svelte-specific but aren't marked: plain `{expression}` braces, `{...spread}`, `<Component>` tags, `:global` in CSS, `<script module>`, `$store`, `$props`, `<slot>`, and `await` in markup. Route names like `[slug]` and `+page` can't be marked, because they're file and folder names, not text in a file.

## Color

The marks use Svelte's brand orange, `#FF3E00`, at 12% opacity on light themes and 18% on dark. Change them at the top of `src/extension.ts`.

Against VS Code's six default themes, text under the marks meets the WCAG AA contrast ratio of 4.5:1 on dark themes. Light themes fall short, because no visible strength of this orange passes there. The lowest is 3.9:1, for the name after `bind:`. Other themes haven't been measured.

## How it works

`src/findMarks.ts` uses Svelte's own parser to read the file, then walks the result to find the Svelte-specific pieces. `src/svelteNames.ts` holds the hand-kept lists of runes, import paths and special exports. `src/extension.ts` draws the marks as editor decorations, which are colored overlays that an extension can place on any text.

The parser only reads components, so a `.js` or `.ts` file gets wrapped in a `<script>` tag first. If that file contains the text `</script>` itself, the wrapper breaks and the file gets no marks. Ordinary JS files are skipped without being parsed, unless their name or contents mention Svelte or SvelteKit.

It can't use the grammar's scopes, for the reasons in `SCOPES.md`.

The parser can't read half-typed code, so marks stay where they are while you type and catch up once the code is valid. A file that opens with an error shows marks for whichever part parsed, its markup or its scripts, and no marks if both are broken.

## Develop

```bash
npm install
```

Open this folder in VS Code and press F5. A second VS Code window opens with the extension loaded and `samples/` open. After changing the code, close that window and press F5 again, so it rebuilds.

```bash
npm run check
```

```bash
npm test
```

## Package

```bash
npm run vsix
```

This creates `svelte-marker-0.0.2.vsix`. Install it with:

```bash
code --install-extension svelte-marker-0.0.2.vsix
```

## Updating Svelte

Svelte is pinned to an exact version, because the shape of the parser's output can change between versions. After updating it, run `npm test`. One test compares the rune list in `src/svelteNames.ts` with the list inside Svelte, so it fails if a new rune has appeared.
