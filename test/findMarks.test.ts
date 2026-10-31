// Tests for the detection logic. They run in plain Node, without VS Code:
//   npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compile } from 'svelte/compiler';
import { findMarks, type Mark } from '../src/findMarks.ts';
import { RUNES, shouldScan } from '../src/svelteNames.ts';

function readProjectFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const modern = readProjectFile('samples/test.svelte');
const legacy = readProjectFile('samples/legacy.svelte');

function markedText(source: string, filePath?: string): string[] {
  return findMarks(source, filePath).marks.map((mark) => source.slice(mark.start, mark.end));
}

// Reads a sample and returns each piece of text it marks.
function markedInSample(path: string): Set<string> {
  return new Set(markedText(readProjectFile(path), path));
}

// Every mark must be inside the file, and no two may overlap: an overlap would
// paint the translucent color twice and look darker.
function assertValidMarks(source: string, marks: Mark[]) {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  let previousEnd = 0;
  for (const { start, end } of sorted) {
    assert.ok(start >= previousEnd, `overlap at ${start}`);
    assert.ok(start < end, `empty mark at ${start}`);
    assert.ok(end <= source.length, `mark past the end at ${end}`);
    previousEnd = end;
  }
}

function assertUnmarked(source: string, snippet: string) {
  const start = source.indexOf(snippet);
  assert.notEqual(start, -1, `sample is missing: ${snippet}`);
  const end = start + snippet.length;
  const touching = findMarks(source).marks.filter((mark) => mark.start < end && mark.end > start);
  assert.deepEqual(touching, [], `should be unmarked: ${snippet}`);
}

test('marks exactly the expected pieces of the modern sample', () => {
  const expected = [
    // Runes
    ...RUNES,
    'with',

    // Blocks and tags
    '{#if',
    '{:else if',
    '{:else}',
    '{/if}',
    '{#each',
    '{/each}',
    'as',
    '{#await',
    '{:then',
    '{:catch',
    '{/await}',
    'then',
    'catch',
    '{#key',
    '{/key}',
    '{#snippet',
    '{/snippet}',
    '{@render',
    '{@html',
    '{@debug',
    '{@attach',
    '{@const',
    '{let',
    '{const',
    '}',

    // Directives
    'bind:scrollY',
    'bind:value',
    'bind:this',
    'class:active',
    'class:double',
    'style:color',
    'style:--size',
    'use:tooltip',
    'transition:fade',
    'transition:fade|global',
    'in:fly',
    'out:fade',
    'animate:flip',

    // Special elements
    'svelte:options',
    'svelte:head',
    'svelte:window',
    'svelte:document',
    'svelte:body',
    'svelte:boundary',
    'svelte:element',

    // SvelteKit imports
    '$app/env/public',
    '$app/navigation',
    '$app/state',
    '$app/env',
    '$app/env/private',
    '#lib/format.js',
    '@sveltejs/kit',
    '$env/static/public',
    '$env/dynamic/private',
    '$lib/Card.svelte',
    '$service-worker',
    '$app/forms',
    './$types',

    // Names imported from SvelteKit
    'goto',
    'page',
    'browser',
    'error',
    'files',

    // Imports from Svelte itself
    'svelte',
    'svelte/transition',
    'svelte/animate',
    'svelte/store',
    'onMount',
    'fade',
    'fly',
    'flip',
    'writable',

    // SvelteKit link options
    'data-sveltekit-preload-data',
    'data-sveltekit-reload',

    // Everything else that isn't plain JS, HTML or CSS
    '{',
    '{...',
    '(',
    ')',
    'Card',
    '--card-color',
    '$theme',
    'this',
    'module',
    'customElement',
    '@component',
    'svelte-ignore',
    ':global',
    '-global-',
  ];
  assert.deepEqual(new Set(markedText(modern)), new Set(expected));
});

test('marks exactly the expected pieces of the legacy sample', () => {
  const expected = [
    'on:click|once',
    'on:keydown',
    'let:item',
    'svelte:fragment',
    'svelte:component',
    'svelte:self',
    '{#if',
    '{',
    '}',
    '{/if}',
    'export',
    '$:',
    '$$props',
    '$$restProps',
    '$$slots',
    'slot',
    'Child',
    'this',
  ];
  assert.deepEqual(new Set(markedText(legacy)), new Set(expected));
});

test('marks special element names in both the opening and closing tag', () => {
  const headMarks = markedText(modern).filter((text) => text === 'svelte:head');
  assert.equal(headMarks.length, 2);
});

test('leaves the "unmarked" section of the sample alone', () => {
  const start = modern.indexOf('<!-- unmarked:start -->');
  const end = modern.indexOf('<!-- unmarked:end -->');
  assert.ok(start > 0 && end > start);
  assertUnmarked(modern, modern.slice(start, end));
});

test('leaves plain code alone', () => {
  assertUnmarked(modern, "'$state(1) in a string'");
  assertUnmarked(modern, '// These stay unmarked: this comment says $state(1)');
  assertUnmarked(modern, 'object.$state()');
  assertUnmarked(modern, 'formatDate');
  assertUnmarked(modern, 'SECRET_KEY');
  assertUnmarked(modern, 'function report(error)');
  assertUnmarked(modern, 'console.log(error.message)');
  assertUnmarked(modern, "'./local.css'");
  assertUnmarked(modern, 'count > 10');
  assertUnmarked(modern, 'count > 0');
  assertUnmarked(modern, 'onclick');
  assertUnmarked(modern, '(body)');
  assertUnmarked(modern, 'Plain CSS stays unmarked, and so does :global in a comment');
});

test('marks SvelteKit syntax in a server route', () => {
  assert.deepEqual(
    markedInSample('samples/src/routes/+page.server.js'),
    new Set([
      'error',
      'fail',
      'redirect',
      '@sveltejs/kit',
      '#lib/server/db.js',
      'load',
      'params',
      'url',
      'actions',
      'request',
      'cookies',
      'prerender',
    ]),
  );
});

test('marks SvelteKit syntax in an API route', () => {
  assert.deepEqual(
    markedInSample('samples/src/routes/api/+server.js'),
    new Set(['json', '@sveltejs/kit', 'GET', 'url', 'POST', 'request']),
  );
});

test('marks hooks, but not functions that are only local', () => {
  assert.deepEqual(
    markedInSample('samples/src/hooks.server.js'),
    new Set(['sequence', '@sveltejs/kit/hooks', 'handle', 'handleError', 'error']),
  );
});

test('marks route matchers', () => {
  assert.deepEqual(markedInSample('samples/src/params/slug.js'), new Set(['match']));
});

test('marks runes in .svelte.js files', () => {
  assert.deepEqual(markedInSample('samples/src/lib/counter.svelte.js'), new Set(['$state', '$derived']));
});

test('runes and special exports only count in the right kind of file', () => {
  const source = 'export function load() {}\nconst x = $state(0);';
  assert.deepEqual(markedText(source, 'src/lib/plain.js'), []);
  assert.deepEqual(markedText(source, 'src/routes/+page.js'), ['load']);
  assert.deepEqual(markedText(source, 'src/lib/plain.svelte.js'), ['$state']);
});

test('a local name hides an imported one', () => {
  const source = `import { error, goto } from '@sveltejs/kit';
try { goto('/'); } catch (error) { console.log(error.message); }
function first(goto) { goto(); }
function second() { const error = 1; return error; }
for (const goto of list) goto();
const object = { error: 1 };
object.error;`;
  const marked = markedText(source, 'src/lib/plain.js');
  assert.deepEqual(marked, ['error', 'goto', '@sveltejs/kit', 'goto']);
});

test('a block or snippet can hide an imported name', () => {
  const source = `<script>
  import { page } from '$app/state';
</script>
{page.url}
{#each items as page}{page.title}{/each}
{#snippet row(page)}{page.title}{/snippet}
{#await promise then page}{page.title}{/await}`;
  assert.equal(markedText(source).filter((text) => text === 'page').length, 2);
});

test('follows renamed imports', () => {
  const source = "import { redirect as go } from '@sveltejs/kit';\ngo(307, '/');";
  assert.deepEqual(markedText(source, 'a.js'), ['redirect as go', '@sveltejs/kit', 'go']);
});

test('names from your own code stay unmarked', () => {
  const source = `import { db } from '$lib/db.js';
import { getDate } from '#lib/dates.js';
import { SECRET } from '$env/static/private';
import { KEY } from '$app/env/private';
import { dev } from '$app/env';
db.find(getDate(SECRET, KEY, dev));`;
  assert.deepEqual(markedText(source, 'a.js'), [
    '$lib/db.js',
    '#lib/dates.js',
    '$env/static/private',
    '$app/env/private',
    'dev',
    '$app/env',
    'dev',
  ]);
});

test('finds special exports behind TypeScript wrappers', () => {
  const source = `export const load = (async ({ params }) => params) satisfies PageLoad;
export const actions = { save: async ({ request }) => request } satisfies Actions;`;
  assert.deepEqual(markedText(source, 'src/routes/+page.server.ts'), [
    'load',
    'params',
    'actions',
    'request',
  ]);
});

test('type-only imports mark the path but not the names', () => {
  const source = "import type { PageProps } from './$types';\nimport type { Page } from '@sveltejs/kit';";
  assert.deepEqual(markedText(source, 'a.ts'), ['./$types', '@sveltejs/kit']);
});

test('an imported name inside a directive gets one mark', () => {
  const source = `<script>
  import { page } from '$app/state';
</script>
<p class:page>Hi</p>`;
  assert.deepEqual(markedText(source), ['page', '$app/state', 'class:page']);
});

test('only scans files that can hold Svelte code', () => {
  assert.equal(shouldScan('src/routes/+page.server.js', ''), true);
  assert.equal(shouldScan('src/hooks.server.ts', ''), true);
  assert.equal(shouldScan('src/lib/state.svelte.ts', ''), true);
  assert.equal(shouldScan('Component.svelte', ''), true);
  assert.equal(shouldScan('src/lib/uses-kit.js', "import '$app/state';"), true);
  assert.equal(shouldScan('src/lib/plain.js', 'const a = 1;'), false);
  assert.equal(shouldScan('src/app.d.ts', "import '$app/state';"), false);
  assert.equal(shouldScan('notes.md', '$app'), false);
  assert.equal(shouldScan('bundle.js', 'svelte'.repeat(100_000)), false);
});

test('a broken JS file gives no marks and says so', () => {
  assert.deepEqual(findMarks('const = ;', 'src/routes/+page.js'), { marks: [], complete: false });
});

test('marks the braces around an expression, but not the JS inside', () => {
  const source = '<p title="a {x} b" onclick={go} {y}>{w}</p>';
  assert.deepEqual(markedText(source), ['{', '}', '{', '}', '{', '}', '{', '}']);
  assertUnmarked(source, 'onclick');
});

test('marks spreads and the braces after directives', () => {
  const source = '<p {...rest} in:fly={{ y: 8 }} class:a={b} style:c={d}></p>';
  assert.deepEqual(markedText(source), [
    '{...',
    '}',
    'in:fly',
    '{',
    '}',
    'class:a',
    '{',
    '}',
    'style:c',
    '{',
    '}',
  ]);
  assertUnmarked(source, '{ y: 8 }');
});

test('marks component names in both tags, and CSS variables passed to them', () => {
  const source = '<Foo.Bar --size="2px">Hi</Foo.Bar>';
  assert.deepEqual(markedText(source), ['Foo.Bar', '--size', 'Foo.Bar']);
});

test('marks the key brackets in an {#each}, but not brackets in JS', () => {
  assert.deepEqual(markedText('{#each a as b (b.id)}x{/each}'), [
    '{#each',
    'as',
    '(',
    ')',
    '}',
    '{/each}',
  ]);
  assert.deepEqual(markedText('{#if (a)}x{/if}'), ['{#if', '}', '{/if}']);
});

test('marks await only directly in the markup', () => {
  assert.deepEqual(markedText('{await x}'), ['{', 'await', '}']);
  assert.deepEqual(markedText('{#if await x}y{/if}'), ['{#if', 'await', '}', '{/if}']);
  assert.deepEqual(markedText('<p onclick={async () => { await x; }}>Hi</p>'), ['{', '}']);
  assert.deepEqual(markedText('<script>await x;</script>'), []);
});

test('marks stores in components, but not in plain JS', () => {
  assert.deepEqual(markedText('<script>$count;</script>\n{$count}'), ['$count', '{', '$count', '}']);
  assert.deepEqual(markedText('$count;', 'src/lib/plain.js'), []);
  assert.deepEqual(markedText('const a = object.$count;', 'a.svelte.js'), []);
});

test('marks legacy $: and export in the main script only', () => {
  const source = '<script module>export const a = 1;</script>\n<script>export let b;\n$: c = b;</script>';
  assert.deepEqual(markedText(source), ['module', 'export', '$:']);
  assert.deepEqual(markedText('export const a = 1;', 'src/lib/plain.js'), []);
});

test('marks instructions in comments, but not ordinary comments', () => {
  assert.deepEqual(markedText('<!-- @component Hi -->\n<!-- svelte-ignore a -->\n<!-- plain -->'), [
    '@component',
    'svelte-ignore',
  ]);
  assert.deepEqual(markedText('<script>// svelte-ignore a\n// plain</script>'), ['svelte-ignore']);
  assert.deepEqual(markedText('// svelte-ignore a', 'src/lib/uses-kit.js'), []);
});

test('marks special script attributes, but not lang', () => {
  const source = '<script lang="ts" module generics="T">const a = 1;</script>';
  assert.deepEqual(markedText(source), ['module', 'generics']);
  assert.deepEqual(markedText('<script context="module">const a = 1;</script>'), ['context']);
});

test('marks this and the attributes on special elements', () => {
  assert.deepEqual(markedText('<svelte:element this={tag}>x</svelte:element>'), [
    'svelte:element',
    'this',
    '{',
    '}',
    'svelte:element',
  ]);
  assert.deepEqual(markedText('<svelte:element this="h2">x</svelte:element>'), [
    'svelte:element',
    'this',
    'svelte:element',
  ]);
  assert.deepEqual(markedText('<svelte:options runes={true} />'), ['svelte:options', 'runes', '{', '}']);
});

test('marks <slot> and <enhanced:img>', () => {
  assert.deepEqual(markedText('<slot /><enhanced:img src="./a.jpg" />'), ['slot', 'enhanced:img']);
});

test('marks :global and -global- in styles, including SCSS', () => {
  const source = `<style lang="scss">
  // :global in a line comment
  /* :global in a block comment */
  $a: red;
  :global(body) { color: $a; }
  .a :global { color: $a; }
  @keyframes -global-spin { from { color: $a; } }
  .-global-x { color: $a; }
</style>`;
  assert.deepEqual(markedText(source), [':global', ':global', '-global-']);
});

test('marks placeholders in SvelteKit templates, and leaves other HTML alone', () => {
  assert.deepEqual(
    markedInSample('samples/src/app.html'),
    new Set(['%sveltekit.head%', 'data-sveltekit-preload-data', '%sveltekit.body%']),
  );
  assert.equal(shouldScan('src/app.html', ''), true);
  assert.equal(shouldScan('src/error.html', ''), true);
  assert.equal(shouldScan('public/index.html', '%sveltekit.head%'), false);
});

test('marks every SvelteKit package in config files', () => {
  assert.deepEqual(
    markedInSample('samples/config-example.js'),
    new Set(['adapter', '@sveltejs/adapter-auto']),
  );
});

test('marks snapshot in a page component, but not in other components', () => {
  assert.deepEqual(
    markedInSample('samples/src/routes/snapshot/+page.svelte'),
    new Set(['$state', 'export', 'snapshot', 'bind:value', '{', '}']),
  );
  assert.deepEqual(markedText('<script>export const snapshot = {};</script>', 'Other.svelte'), ['export']);
});

test('marks env placeholders in SvelteKit templates', () => {
  const source = '<head>%sveltekit.env.PUBLIC_API_URL% %sveltekit.env.PUBLIC_V2%</head>';
  assert.deepEqual(markedText(source, 'src/app.html'), [
    '%sveltekit.env.PUBLIC_API_URL%',
    '%sveltekit.env.PUBLIC_V2%',
  ]);
});

test('provided values are only marked in functions SvelteKit fills in', () => {
  const snapshot = '<script>export const snapshot = { capture: () => 1, restore: ({ a, b }) => a };</script>';
  assert.deepEqual(markedText(snapshot, 'src/routes/+page.svelte'), ['export', 'snapshot']);
  const transport = 'export const transport = { V: { encode: (v) => v, decode: ({ x }) => x } };';
  assert.deepEqual(markedText(transport, 'src/hooks.ts'), ['transport']);
  const actions = 'export const actions = { ...other, save: ({ request }) => request };';
  assert.deepEqual(markedText(actions, 'src/routes/+page.server.js'), ['actions', 'request']);
});

test('marks export only where it adds a prop or method', () => {
  const source = `<script lang="ts">
  let a, b;
  export { a, b as c };
  export { type T, a as d };
  export type U = string;
  export interface V {}
  export declare const w: string;
  export type { X };
  export { type Y };
  export { z } from './z';
</script>`;
  assert.deepEqual(markedText(source), ['export', 'export']);
});

test('finds special exports in export lists', () => {
  const route = `const handler = ({ request }) => request;
export { handler as GET, handler as POST, handler as other };`;
  assert.deepEqual(markedText(route, 'src/routes/api/+server.js'), ['request', 'GET', 'POST']);
  const page = 'const load = ({ params }) => params;\nexport { load };';
  assert.deepEqual(markedText(page, 'src/routes/+page.js'), ['params', 'load']);
  const reexport = "export { GET } from './shared.js';";
  assert.deepEqual(markedText(reexport, 'src/routes/api/+server.js'), ['GET']);
  assert.deepEqual(markedText('export type { load };\nexport { type actions };', 'src/routes/+page.server.ts'), []);
});

test('custom elements are not taken for style or script blocks', () => {
  const styled = '<style-guide>\n<p class:a>x</p>\n</style-guide>\n<style>\n.a {}\n</style>';
  assert.deepEqual(markedText(styled), ['class:a']);
  const scripted = '<script-box>\n</script-box>\n<p class:a>x</p>\n<script>\nlet x = $state(\n</script>';
  assert.equal(findMarks(scripted).complete, false);
  assert.deepEqual(markedText(scripted), ['class:a']);
});

test('only marks CSS in the real style block', () => {
  const css = '<style>\n  :global(a) { color: red; }\n</style>';
  assert.deepEqual(markedText(css), [':global']);
  assert.deepEqual(markedText(`<!--\n${css}\n-->`), []);
  assert.deepEqual(markedText(`<svelte:head>\n${css}\n</svelte:head>`), ['svelte:head', 'svelte:head']);
  assert.deepEqual(markedText(`<script>\nconst a = \`\n${css}\n\`;\n</script>`), []);
});

test('style marks survive broken code', () => {
  const css = '<style>\n  :global(a) { color: red; }\n</style>';
  const brokenScript = `<script>let x = $state(</script>\n<p class:on>Hi</p>\n${css}`;
  assert.deepEqual(markedText(brokenScript), ['class:on', ':global']);
  const brokenBoth = `<script>let x = $state(</script>\n<p bind:>Hi</p>\n${css}`;
  assert.deepEqual(markedText(brokenBoth), [':global']);
});

test('leaves :global alone in CSS strings and trailing comments', () => {
  const source = `<style lang="scss">
  .a { color: red; } // was :global(.b)
  .c::before { content: ":global"; }
  [data-x=':global'] { color: red; }
  .d { background: url(http://a.b/c.png); } :global(.e) { color: red; }
</style>`;
  assert.deepEqual(markedText(source), [':global']);
});

test('marks -global- after browser-prefixed keyframes', () => {
  const source = '<style>\n@-webkit-keyframes -global-a {}\n@-moz-keyframes -global-b {}\n.-global-c {}\n</style>';
  assert.deepEqual(markedText(source), ['-global-', '-global-']);
});

test('comment keywords only count at the start of the right kind of comment', () => {
  assert.deepEqual(markedText('<!-- do not use svelte-ignore or @component here -->'), []);
  assert.deepEqual(markedText('<!--\n  @component\n  Docs\n-->'), ['@component']);
  const script = `<script>
// TODO remove the svelte-ignore below
/** @component is only for the markup */
// @component
/* svelte-ignore a */
</script>`;
  assert.deepEqual(markedText(script), ['svelte-ignore']);
});

test('more kinds of local name hide an imported one', () => {
  const imports = "import { error } from '@sveltejs/kit';\n";
  const locals = [
    'function a(x) { switch (x) { case 1: const error = 2; return error; } }',
    'function a() { class error {} return new error(); }',
    'const a = function error() { return error; };',
    'const a = class error { b() { return error; } };',
    'class A { static { const error = 1; error; } }',
  ];
  for (const code of locals) {
    assert.deepEqual(markedText(imports + code, 'a.js'), ['error', '@sveltejs/kit'], code);
  }
});

test('a let: directive hides an imported name inside the element', () => {
  const imports = "<script>import { page } from '$app/state';</script>\n";
  const pageCount = (markup: string) => markedText(imports + markup).filter((text) => text === 'page').length;
  assert.equal(pageCount('<Foo let:page>{page.x}</Foo>'), 1);
  assert.equal(pageCount('<Foo let:a={page}>{page.x}</Foo>'), 1);
  assert.equal(pageCount('<Foo let:a={{ page, b: [c] }}>{page.x}</Foo>'), 1);
  assert.equal(pageCount('<Foo let:page prop={page}>x</Foo>'), 2);
});

test('runes count in any module with .svelte in its name', () => {
  const source = 'const x = $state(0);';
  for (const path of ['a.svelte.js', 'a.svelte.ts', 'a.svelte.test.ts', 'src/a.svelte.spec.js']) {
    assert.deepEqual(markedText(source, path), ['$state'], path);
  }
  for (const path of ['a.test.ts', 'a.svelte.md', 'my.svelte/a.js']) {
    assert.deepEqual(markedText(source, path), [], path);
  }
  assert.equal(shouldScan('src/a.svelte.test.ts', ''), true);
});

test('a plain name as an {#each} key is a use', () => {
  const imports = "<script>import { page } from '$app/state';</script>\n";
  const pageMarks = markedText(`${imports}{#each a as b (page)}x{/each}`).filter((text) => text === 'page');
  assert.equal(pageMarks.length, 2);
  assert.ok(markedText('{#each a as b ($id)}x{/each}').includes('$id'));
  const hiddenMarks = markedText(`${imports}{#each a as page (page)}x{/each}`).filter((text) => text === 'page');
  assert.equal(hiddenMarks.length, 1);
});

test('finds closing tags by what they say, not by a pattern', () => {
  assert.deepEqual(markedText('<Foo.$Bar>x</Foo.$Bar>'), ['Foo.$Bar', 'Foo.$Bar']);
  assert.deepEqual(markedText('<Foo$>x</Foo$>'), ['Foo$', 'Foo$']);
  assert.deepEqual(markedText('<p><Foo></Foo></p>'), ['Foo', 'Foo']);
  assert.deepEqual(markedText('<Foo></Foo  >'), ['Foo', 'Foo']);
  assert.deepEqual(markedText('<Foo /><p></p>'), ['Foo']);
  assert.deepEqual(markedText('<Foo a="</Foo>" />'), ['Foo']);
});

test('marks CSS variables only on components', () => {
  assert.deepEqual(markedText('<div --size="2px"></div>'), []);
  assert.deepEqual(markedText('<Foo --size="2px" />'), ['Foo', '--size']);
  assert.deepEqual(markedText('<svelte:component this={A} --size="2px" />'), [
    'svelte:component',
    'this',
    '{',
    '}',
    '--size',
  ]);
});

test('marks slot only on the direct child of a component', () => {
  assert.deepEqual(markedText('<Foo><div slot="a">x</div></Foo>'), ['Foo', 'slot', 'Foo']);
  assert.deepEqual(markedText('<my-card><div slot="a">x</div></my-card>'), []);
  assert.deepEqual(markedText('<Foo><my-card><div slot="a">x</div></my-card></Foo>'), ['Foo', 'Foo']);
  assert.deepEqual(markedText('<Foo><div class:slot>x</div></Foo>'), ['Foo', 'class:slot', 'Foo']);
});

test('an unclosed {#each} never gives a bad position', () => {
  const source = '{#each a as b (b';
  assertValidMarks(source, findMarks(source).marks);
});

test('marks do not overlap', () => {
  assertValidMarks(modern, findMarks(modern).marks);
  assertValidMarks(legacy, findMarks(legacy).marks);
});

test('the samples are valid Svelte', () => {
  assert.doesNotThrow(() => compile(modern, { customElement: true }));
  assert.doesNotThrow(() => compile(legacy, {}));
});

test('handles TypeScript syntax', () => {
  const source = `<script lang="ts">
  import type { PageProps } from './$types';
  let count = $state<number>(0);
  let list = $state.raw<string[]>([]);
</script>
{#snippet row<T>(item: T)}<p>{item}</p>{/snippet}`;
  assert.deepEqual(markedText(source), [
    './$types',
    '$state',
    '$state.raw',
    '{#snippet',
    '}',
    '{',
    '}',
    '{/snippet}',
  ]);
});

test('style blocks in other languages do not stop the parser', () => {
  const source = '<p class:on>Hi</p>\n<style lang="scss">$a: red; .b { color: $a; }</style>';
  const { complete } = findMarks(source);
  assert.equal(complete, true);
  assert.deepEqual(markedText(source), ['class:on']);
});

test('a broken script keeps the markup marks', () => {
  const source = '<script>let x = $state(</script>\n<p class:on>Hi</p>';
  assert.equal(findMarks(source).complete, false);
  assert.deepEqual(markedText(source), ['class:on']);
});

test('broken markup keeps the script marks', () => {
  const source = '<script>let x = $state(0);</script>\n<p bind:>Hi</p>';
  assert.equal(findMarks(source).complete, false);
  assert.deepEqual(markedText(source), ['$state']);
});

// Stands in for half-typed code: every cut must give valid marks and never crash.
test('survives being cut off at every character', () => {
  const samples = [
    ['Component.svelte', modern],
    ['Component.svelte', legacy],
    ['src/routes/+page.server.js', readProjectFile('samples/src/routes/+page.server.js')],
  ];
  for (const [filePath, sample] of samples) {
    for (let length = 0; length <= sample.length; length++) {
      const source = sample.slice(0, length);
      assertValidMarks(source, findMarks(source, filePath).marks);
    }
  }
});

// Svelte's list is internal, so it isn't a public API. If Svelte moves it, this
// test fails, and that's the prompt to find it again and update the list.
test('the rune list matches the one inside Svelte', () => {
  const utils = readProjectFile('node_modules/svelte/src/utils.js');
  const block = utils.slice(
    utils.indexOf('const STATE_CREATION_RUNES'),
    utils.indexOf('export function is_rune'),
  );
  const svelteRunes = [...block.matchAll(/'(\$[^']+)'/g)]
    .map((match) => match[1])
    .filter((name) => name !== '$inspect().with'); // markRune handles this one itself
  assert.ok(svelteRunes.length > 0, "couldn't find the rune list inside Svelte");
  assert.deepEqual(new Set(svelteRunes), RUNES);
});
