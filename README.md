# Svelte Marker

Paints a translucent violet mark, like a highlighter's, behind Svelte and SvelteKit syntax and names, so you can tell them apart from plain HTML, JS and CSS at a glance.

The rule: text gets a mark if plain JS, HTML or CSS couldn't read it or would read it differently, like `{#if` and `$count`, or if Svelte fixes its spelling, so renaming it would break your code, like `load`, `$lib`, `Snippet` and `'auto'` in `prerender = 'auto'`. The brackets that belong to Svelte syntax get one too, like the `<>` in `<svelte:head>` and the `()` in `$props()`. A name spelled by the web platform, by TypeScript or by you stays unmarked, even when it holds something of Svelte's. Here Svelte means Svelte, SvelteKit and the packages under `@sveltejs/`.

It only adds a background, so your theme's text colors stay the same and it works with any color theme.

## Install

You need VS Code 1.100 or newer. Download `svelte-marker-0.0.7.vsix`, then run:

```bash
code --install-extension svelte-marker-0.0.7.vsix
```

Or open the Extensions view in VS Code, click the **...** menu at the top, and choose **Install from VSIX**.

[Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) installs along with it if you don't have it yet. It's what tells VS Code that a `.svelte` file is Svelte, so Svelte Marker can't run without it.

## Use

Marks appear on their own when you open a Svelte file. Turn them on and off with **Svelte Marker: Toggle Marks** in the Command Palette. The setting survives restarts.

## What gets marked

| Group | Examples |
|---|---|
| Expressions | the braces in `{count}`, `onclick={go}` and `title="{name}"`, and `{...` and `}` in `{...rest}` |
| Components | `<Card`, `>`, `/>` and `</Card>`, and `--size` in `<Card --size="2px">` |
| Runes | `$state`, `$derived.by`, `$effect.pre`, `$props.id`, `$inspect(...).with`, and their `()` |
| Blocks and tags | `{#if`, `{:else}`, `{/if}`, `{@render`, `{@attach`, `{let`, `{const`, the `()` in `{@render row()}` |
| `await` | `await` in markup, at the top of a component's script, and in `$derived(...)`, where Svelte waits for it, but not inside a function of yours |
| Names a tag creates | `as goal` and the `()` around the key in `as goal (goal.id)`, `, i` in `{#each list, i}`, `then value`, `{:catch error}`, the whole of `{#snippet row(item)}` |
| Directives | `bind:value`, `class:active`, `use:tooltip`, `transition:fade\|global`, legacy `on:click`, and the `,` between the getter and the setter in `bind:value={get, set}` |
| Transition events | `onintrostart`, `onintroend`, `onoutrostart` and `onoutroend` on an element |
| Special elements | `<svelte:head>`, `<svelte:window />`, `<svelte:boundary>` and its `pending`, `failed` and `onerror`, `<enhanced:img />`, legacy `<svelte:self />` and `<slot />`, with their closing tags |
| Stores and legacy | `$count`, `$:`, `export let`, `export { a as b }`, `$$props`, `$$restProps`, `$$slots`, `$$Props`, `$$Generic`, `$$Slots`, `$$Events`, `slot="row"` |
| Comments | `svelte-ignore` at the start of a comment, `@component` anywhere in one |
| Script attributes | `module`, `generics`, legacy `context` |
| CSS | `:global` and the `()` in `:global(.a)`, `-global-` |
| Imports | the whole of `svelte/transition`, `$app/forms`, `$env/static/private`, `$service-worker` and `@sveltejs/kit/vite`, but only `$lib` in `$lib/utils`, `#lib` in `#lib/utils` and `$types` in `./$types`, because the rest is your path. Also in `import('./$types')` in a type or JSDoc |
| Imported names | `onMount`, `fade`, `redirect`, `error`, `fail`, `goto`, `page`, `env` from `$env/dynamic/private`, and types like `Snippet` and `PageLoad`, wherever they're used, including `error` in `kit.error()`, `export { page } from` and `await import()` |
| Members | `locals` in `event.locals`, `url` in `page.url`, `get` in `cookies.get()`, `set` on a store, `current` on a `Tween` or on `innerWidth` from `svelte/reactivity/window`, `type` on what `deserialize()` returns, also after `const { params } = event`, `const e = event` or `for (const cookie of cookies.getAll())` |
| Remote functions | `current`, `loading` and `refresh` on what a remote query returns, and `fields`, `pending` and `enhance` on a remote form, when you import them from a `.remote.ts` file |
| Special exports | `load`, `actions`, `prerender`, `GET`, `POST`, `handle`, `match`, `snapshot`, plus `params` in `src/params.ts` and `variables` in `src/env.ts`, only in the file types where they mean something |
| Fixed keys | `default` in `actions`, `replaceState` in `goto(url, { replaceState })`, `duration` in `transition:fade={{ duration }}`, `target` in `mount()`, `transformPageChunk` in `resolve()`, `message` in what `handleError` returns, `update` and `destroy` in what your own action returns, `shadow` in `<svelte:options customElement={{ shadow }}>` |
| Fixed values | the text of a string Svelte fixes, but not its quotes: `auto` in `prerender = 'auto'`, `success` in `result.type === 'success'`, `leave` in `type === 'leave'` in `beforeNavigate`, `hash` in `router: { type: 'hash' }`, `server` in `compile(source, { generate: 'server' })`, `hover` in `data-sveltekit-preload-data="hover"`, `svg` in `<svelte:options namespace="svg">` |
| Options | `kit`, `compilerOptions` and the rest in `svelte.config.js` and in `sveltekit({ ... })`, adapter options like `out` in `adapter({ out })`, and `markup` and `content` in a preprocessor, but not your own keys in `alias` |
| Tools | the options and results of `compile()`, the syntax tree `parse()` returns, like `fragment` and `nodes`, `name` and `adapt` in an adapter you write, and Svelte 4's `new App({ target })` and `$set` |
| Provided values | `params`, `url`, `cookies`, `request`, wherever they're used, as in `load({ params })` or `wrap(({ params }) => ...)`, and what Svelte passes to your callbacks, like `to` and `cancel` in `beforeNavigate(({ to, cancel }) => ...)` and `formData` in `use:enhance` |
| Fixed props | `children` from `$props()`, plus `data`, `form` and `params` in `+page.svelte`, `data` and `params` in `+layout.svelte`, and `error` in `+error.svelte`, wherever they're used, also in `props.children` and legacy `export let data` |
| Form actions | `?/` in `action="?/create"` and `formaction="/login?/register"` |
| SvelteKit templates | `%sveltekit.head%` in `src/app.html` and `src/error.html`, and all of `%sveltekit.env.PUBLIC_NAME%` except your variable's name. `data-sveltekit-preload-data` there and in markup |
| SvelteKit's global types | `App.Locals` in a type, and `App`, `Locals`, `PageData`, `PageState`, `Platform` and `Error` in `src/app.d.ts` |

The JS inside stays unmarked: in `{#if count > 0}`, only `{#if` and `}` get a mark, and in `$state(0)`, the `0` stays clear. What a tag creates is different, because plain JS would read it another way: `goal (goal.id)` would be a function call, so `goal` and the `()` get marks. The key `goal.id` inside them is plain JS, so it stays clear. Attributes inside a Svelte tag get marks only if they're Svelte's own. Plain attributes like `onclick` stay unmarked too, though the braces in `onclick={go}` don't.

Some names stay unmarked on purpose. Names from `$lib` and `#lib` are your own code, so only the placeholder in the import path gets a mark. Your environment variables are yours too: `PUBLIC_API` from `$env/static/public` or `$app/env/public`, and `SECRET` in `env.SECRET`, stay unmarked, though `env` itself is SvelteKit's. A local variable that shares a name with an import, like `error` in `catch (error)`, stays unmarked too. So does a name you choose for something of Svelte's: `go` in `import { redirect as go }`, `kit` in `import * as kit`, `adapter` in `import adapter from '@sveltejs/adapter-auto'`, `p` in `load({ params: p })` and `content` in `{ children: content }`. Names the web platform fixes stay unmarked as well, like `pathname` in `page.url.pathname`, because `url` holds an ordinary URL. So do strings it fixes, like `POST` for a remote form's `method`.

Runes are marked in `.svelte` files and in modules with `.svelte` in their name, like `.svelte.ts` and `.svelte.test.ts`, because `$state()` is an ordinary function call anywhere else.

SvelteKit's `hooks`, `params` and `env` files are found by their path, so they only count when the nearest `package.json` lists `@sveltejs/kit`, or when there's no `package.json` above the file at all. In a package that doesn't list it, `src/hooks.ts` is an ordinary file. The same goes for what only SvelteKit reads in a component: `?/` in a form action, `data-sveltekit-` link options, `App.Locals` and imports from `.remote.ts` files.

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

- Marks stay where they are while you type and catch up once the code is valid, because half-typed code can't be parsed. A file that opens with an error shows marks for whichever part parsed, its markup or its scripts, keeps them up to date as you type, and has no marks if both are broken.
- Route names like `[slug]` and `+page` can't be marked, because they're file and folder names, not text in a file.
- Marks follow a Svelte value within one file, and into the functions Svelte calls, like `load` or a `beforeNavigate` callback. In a helper you call yourself, like `function auth(event) { return event.locals; }`, `locals` stays unmarked, because nothing in that file says what `event` holds. A value that comes from another of your files stays unmarked for the same reason, unless the file's name says what it holds: a `.remote.ts` file exports remote functions, and a `.svelte` file exports a component.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). The extension includes the Svelte compiler. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for its licenses.
