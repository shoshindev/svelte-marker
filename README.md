# Svelte Marker

Paints a translucent violet highlighter mark behind Svelte and SvelteKit syntax, so you can tell it apart from plain HTML, JS and CSS at a glance.

The rule: if plain JS, HTML or CSS wouldn't have it, or Svelte gives it a special meaning, it gets a mark, along with the brackets that belong to it, like the `<>` in `<svelte:head>` and the `()` in `$props()`. TypeScript is the one exception: it isn't plain JS, but it isn't Svelte either, so it stays unmarked. It only adds a background, so your theme's text colors stay the same and it works with any color theme.

## Install

You need VS Code 1.100 or newer. Download `svelte-marker-0.0.4.vsix`, then run:

```bash
code --install-extension svelte-marker-0.0.4.vsix
```

Or open the Extensions view in VS Code, click the **...** menu at the top, and choose **Install from VSIX**.

[Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) installs along with it if you don't have it yet. It's what tells VS Code that a `.svelte` file is Svelte, so Svelte Marker can't run without it.

## Use

Marks appear on their own when you open a Svelte file. Turn them on and off with **Svelte Marker: Toggle Highlighting** in the Command Palette. The setting survives restarts.

## What gets marked

| Group | Examples |
|---|---|
| Expressions | the braces in `{count}`, `onclick={go}` and `title="{name}"`, and `{...` and `}` in `{...rest}` |
| Components | `<Card`, `>`, `/>` and `</Card>`, and `--size` in `<Card --size="2px">` |
| Runes | `$state`, `$derived.by`, `$effect.pre`, `$props.id`, `$inspect(...).with`, and their `()` |
| Blocks and tags | `{#if`, `{:else}`, `{/if}`, `{@render`, `{@attach`, `{let`, `{const`, the `()` in `{@render row()}`, and `await` in markup |
| Names a tag creates | `as goal (goal.id)`, `then value`, `{:catch error}`, the whole of `{#snippet row(item)}` |
| Directives | `bind:value`, `class:active`, `use:tooltip`, `transition:fade\|global`, legacy `on:click` |
| Special elements | `<svelte:head>`, `<svelte:window />`, `<svelte:boundary>`, `<enhanced:img />`, legacy `<svelte:self />` and `<slot />`, with their closing tags |
| Stores and legacy | `$count`, `$:`, `export let`, `export { a as b }`, `$$props`, `$$restProps`, `$$slots`, `slot="row"` |
| Comments | `svelte-ignore` and `@component`, at the start of a comment |
| Script attributes | `module`, `generics`, legacy `context` |
| CSS | `:global` and the `()` in `:global(.a)`, `-global-` |
| Imports | `svelte`, `$app`, `$env`, `$lib`, `#lib`, `$service-worker`, `@sveltejs/kit` and other `@sveltejs/` packages, `$types`, but not the rest of the path, like `/forms` in `$app/forms` |
| Imported names | `onMount`, `fade`, `redirect`, `error`, `fail`, `goto`, `page`, wherever they're used |
| Special exports | `load`, `actions`, `prerender`, `GET`, `POST`, `handle`, `match`, `snapshot`, only in the file types where they mean something |
| Provided values | `params`, `url`, `cookies`, `request`, where they're listed, as in `load({ params })` |
| Fixed props | `children` from `$props()`, plus `data`, `form` and `params` in `+page.svelte` and `data` in `+layout.svelte`, wherever they're used |
| SvelteKit templates | `%sveltekit.head%`, `data-sveltekit-preload-data`, in markup and in `src/app.html` and `src/error.html` |

The JS inside stays unmarked: in `{#if count > 0}`, only `{#if` and `}` get a mark, and in `$state(0)`, the `0` stays clear. What a tag creates is different, because plain JS would read it another way: `goal (goal.id)` would be a function call. Attributes inside a Svelte tag get marks only if they're Svelte's own. Plain attributes like `onclick` stay unmarked too, though the braces in `onclick={go}` don't.

Some names stay unmarked on purpose. Names from `$lib`, `#lib`, `$env/*` and `$app/env/public` are your own code and variables, so only the placeholder in the import path gets a mark. A local variable that shares a name with an import, like `error` in `catch (error)`, stays unmarked too. So does your own name for a fixed prop, like `content` in `{ children: content }`.

Runes are marked in `.svelte` files and in modules with `.svelte` in their name, like `.svelte.ts` and `.svelte.test.ts`, because `$state()` is an ordinary function call anywhere else.

## Color

The marks use violet, `#8B5CF6`, at 18% opacity on light themes and 26% on dark. To use another color, add this to your `settings.json`:

```json
"workbench.colorCustomizations": {
  "svelteMarker.background": "#0066FF26"
}
```

The last two digits set the opacity. Keep it low, or the mark will hide the text.

Against VS Code's ten built-in themes, text under the default marks meets the WCAG AA contrast ratio of 4.5:1 only on the two high contrast themes. The lowest is 3.6:1, for `svelte-ignore` and `@component` in comments. Themes with dimmer text colors score lower.

## Known limits

- Marks stay where they are while you type and catch up once the code is valid, because half-typed code can't be parsed. A file that opens with an error shows marks for whichever part parsed, its markup or its scripts, and no marks if both are broken.
- A `.js` or `.ts` file that contains the text `</script>` gets no marks.
- Route names like `[slug]` and `+page` can't be marked, because they're file and folder names, not text in a file.
- A value SvelteKit passes in, like `params`, is only marked where it's listed, because after that it reads like any other variable.
- Fixed props are only found when they're listed in `$props()`, so `props.children` and legacy `export let data` stay unmarked.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). The extension includes the Svelte compiler. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for its licenses.
