# Contributing

## How it works

`src/findMarks.ts` uses Svelte's own parser to read the file, then walks the result to find the Svelte-specific pieces. `src/svelteNames.ts` holds the hand-kept lists of runes, import paths and special exports. `src/shapes.ts` lists what Svelte's and SvelteKit's values hold, like the `locals` and `cookies` of a request event, so that a value can be followed from where it enters a file, through `event.locals` and `const { params } = event`, and into the functions Svelte calls. It stops at other files and at functions only your code calls, for the reasons in `docs/adr/0001-marks-follow-values-within-one-file.md`. The shapes in `src/shapes.ts` are written by hand. `src/generatedShapes.ts` holds the rest, mostly for tools built on Svelte, and `scripts/generateShapes.ts` writes it from the types, as `docs/adr/0002-generate-the-shapes-for-tools.md` explains. `src/kitProject.ts` checks whether a file belongs to a SvelteKit project. `src/extension.ts` draws the marks as editor decorations, which are colored overlays that an extension can place on any text. The mark's default colors are in `package.json`, under `contributes.colors`.

The parser only reads components, so a `.js` or `.ts` file gets wrapped in a `<script>` tag first. Any `</script>` text in that file is swapped for text of the same length, so it can't end the wrapper early. Ordinary JS files are skipped without being parsed, unless their name or contents mention Svelte or SvelteKit. `:global` is found with a pattern rather than the parser, because the parser can't read SCSS.

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

This creates `svelte-marker-0.0.6.vsix`. It also rewrites `THIRD-PARTY-NOTICES.md`, so commit that file if it changes.

`images/icon.png` is a 256px render of `images/icon.svg`. Marketplace icons can't be SVG, so export it again after changing the SVG.

## Updating Svelte

Svelte is pinned to an exact version, because the shape of the parser's output can change between versions. After updating it, run `npm test`. One test compares the rune list in `src/svelteNames.ts` with the list inside Svelte, so it fails if a new rune has appeared.

SvelteKit, vite-plugin-svelte and the official adapters are pinned too, though the extension doesn't include them. After updating any of them, or Svelte, run:

```bash
npm run shapes
```

```bash
npm test
```

The first command rewrites `src/generatedShapes.ts` from their types. `test/svelteNames.test.ts` then checks three things:

- Each hand-written shape in `src/shapes.ts` lists the same names as the type `test/svelteTypes.ts` pairs it with. If a name was added, add it to the shape. If one was removed, move it to the shape's `older` list, so code written for the older version keeps its marks.
- Every name that Svelte's and SvelteKit's exports hold, in their arguments, return values and members, has a shape. A new one fails the test until it has a shape, or a line in `LEFT_OUT` in `scripts/typeReader.ts` that says why it stays unmarked, like `pathname` on a URL, which the web platform names.
- `src/generatedShapes.ts` is up to date.

The tests and the generator use TypeScript 6, installed as `typescript-6`, because TypeScript 7, which checks the project, can't yet be used from code. SvelteKit asks for TypeScript 6 as a peer dependency, which clashes with TypeScript 7, so `.npmrc` tells npm not to install peer dependencies.
