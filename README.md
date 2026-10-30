# Svelte Marker

Paints a translucent orange highlighter mark behind Svelte-specific syntax in `.svelte` files, so you can tell it apart from plain HTML, JS and CSS at a glance. It only adds a background, so your theme's text colors stay the same and it works with any color theme.

Turn it on and off with **Svelte Marker: Toggle Highlighting** in the Command Palette. The setting survives restarts.

It needs [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode), because that's what tells VS Code a `.svelte` file is Svelte.

## What gets marked

| Group | Examples |
|---|---|
| Runes | `$state`, `$derived.by`, `$effect.pre`, `$props.id`, `$inspect(...).with` |
| Blocks and tags | `{#if`, `{:else}`, `{/if}`, `{@render`, `{@attach`, `{let`, `{const` |
| Directives | `bind:value`, `class:active`, `use:tooltip`, `transition:fade\|global`, legacy `on:click` |
| Special elements | `svelte:head`, `svelte:window`, `svelte:boundary`, legacy `svelte:self` |
| SvelteKit imports | `$app/*`, `$env/*`, `$lib`, `#lib`, `$service-worker`, `@sveltejs/kit`, `./$types` |

The JS inside a block stays unmarked: in `{#if count > 0}`, only `{#if` and `}` get a mark. So do plain attributes like `onclick`.

These are Svelte-specific but aren't marked: plain `{expression}` braces, `{...spread}`, `<Component>` tags, `:global` in CSS, `<script module>`, `$store`, `$$props`, `<slot>`, imports from `svelte/*`, and `await` in markup.

## Color

The marks use Svelte's brand orange, `#FF3E00`, at 12% opacity on light themes and 18% on dark. Change them at the top of `src/extension.ts`.

Against VS Code's six default themes, text under the marks meets the WCAG AA contrast ratio of 4.5:1 on dark themes. Light themes fall short, because no visible strength of this orange passes there. The lowest is 3.9:1, for the name after `bind:`. Other themes haven't been measured.

## How it works

`src/findMarks.ts` uses Svelte's own parser to read the file, then walks the result to find the Svelte-specific pieces. `src/extension.ts` draws those as editor decorations, which are colored overlays that an extension can place on any text.

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

This creates `svelte-marker-0.0.1.vsix`. Install it with:

```bash
code --install-extension svelte-marker-0.0.1.vsix
```

## Updating Svelte

Svelte is pinned to an exact version, because the shape of the parser's output can change between versions. After updating it, run `npm test`. One test compares the rune list in `src/findMarks.ts` with the list inside Svelte, so it fails if a new rune has appeared.
