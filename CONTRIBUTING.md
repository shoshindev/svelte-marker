# Contributing

## How it works

`src/findMarks.ts` uses Svelte's own parser to read the file, then walks the result to find the Svelte-specific pieces. `src/svelteNames.ts` holds the hand-kept lists of runes, import paths and special exports. `src/extension.ts` draws the marks as editor decorations, which are colored overlays that an extension can place on any text. The mark's default colors are in `package.json`, under `contributes.colors`.

The parser only reads components, so a `.js` or `.ts` file gets wrapped in a `<script>` tag first. If that file contains the text `</script>` itself, the wrapper breaks and the file gets no marks. Ordinary JS files are skipped without being parsed, unless their name or contents mention Svelte or SvelteKit. `:global` is found with a pattern rather than the parser, because the parser can't read SCSS.

It can't use the grammar's scopes, for the reasons in `SCOPES.md`.

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

This creates `svelte-marker-0.0.4.vsix`. It also rewrites `THIRD-PARTY-NOTICES.md`, so commit that file if it changes.

`images/icon.png` is a 256px render of `images/icon.svg`. Marketplace icons can't be SVG, so export it again after changing the SVG.

## Updating Svelte

Svelte is pinned to an exact version, because the shape of the parser's output can change between versions. After updating it, run `npm test`. One test compares the rune list in `src/svelteNames.ts` with the list inside Svelte, so it fails if a new rune has appeared.
