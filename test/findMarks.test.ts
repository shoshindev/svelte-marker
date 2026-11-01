// Tests for the detection logic. They run in plain Node, without VS Code:
//   npm test

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compile } from 'svelte/compiler';
import { findMarks, type Mark } from '../src/findMarks.ts';
import { isKitProject } from '../src/kitProject.ts';
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

    // Names that tags create
    ' item (item.id)',
    ' item, index (item.id)',
    ' value',
    ' failure',
    ' failed',
    '(problem',
    ', reset',
    ' row',
    '(label',
    ', size',
    ' children',
    '()',

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
    '<svelte:options',
    '<svelte:head',
    '</svelte:head>',
    '<svelte:window',
    '<svelte:document',
    '<svelte:body',
    '<svelte:boundary',
    '</svelte:boundary>',
    '<svelte:element',
    '</svelte:element>',
    '>',
    '/>',

    // SvelteKit imports
    '$app',
    '#lib',
    '@sveltejs/kit',
    '$env',
    '$lib',
    '$service-worker',
    '$types',

    // Names imported from SvelteKit
    'goto',
    'page',
    'browser',
    'error',
    'files',

    // Imports from Svelte itself
    'svelte',
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
    '<Card',
    '</Card>',
    '--card-color',
    'children',
    '$theme',
    'this',
    'onerror',
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
    '<svelte:fragment',
    '</svelte:fragment>',
    '<svelte:component',
    '<svelte:self',
    '<slot',
    '>',
    '/>',
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
    '<Child',
    '</Child>',
    'this',
  ];
  assert.deepEqual(new Set(markedText(legacy)), new Set(expected));
});

test('marks both tags of a special element, brackets included', () => {
  assert.deepEqual(markedText('<svelte:head>x</svelte:head>'), ['<svelte:head', '>', '</svelte:head>']);
  assert.deepEqual(markedText('<svelte:window/>'), ['<svelte:window', '/>']);
  assert.deepEqual(markedText('<svelte:window />'), ['<svelte:window', '/>']);
  assert.deepEqual(markedText('<Foo a="1" b={c > d}>x</Foo>'), ['<Foo', '{', '}', '>', '</Foo>']);
  assert.deepEqual(markedText('<div>x</div>'), []);
});

test('finds the end of a tag past any > in a value', () => {
  const source = "<svelte:element this={a > b ? 'p' : 'q'} class=\"x>y\">z</svelte:element>";
  assert.deepEqual(markedText(source), [
    '<svelte:element',
    'this',
    '{',
    '}',
    '>',
    '</svelte:element>',
  ]);
  assert.equal(findMarks(source).marks[4].start, source.indexOf('">') + 1);
  assert.deepEqual(markedText('<svelte:element class="x" this={a > b} />'), [
    '<svelte:element',
    'this',
    '{',
    '}',
    '/>',
  ]);
});

test('marks only the placeholder in an import path', () => {
  const source = `import '$app/forms';
import '#lib/a/b.js';
import './$types.js';
import 'svelte/store';
import '@sveltejs/kit/hooks';
import './other.js';
import('$lib/c.js');`;
  assert.deepEqual(markedText(source, 'a.js'), ['$app', '#lib', '$types', 'svelte', '@sveltejs/kit', '$lib']);
  assert.equal(findMarks(source, 'a.js').marks[2].start, source.indexOf('$types'));
});

test('marks the brackets of a rune, but not the JS inside', () => {
  const source = '<script>let a = $state(b(1));\nlet c = $props();</script>';
  assert.deepEqual(markedText(source), ['$state', '(', ')', '$props', '(', ')']);
  assertUnmarked(source, 'b(1)');
  assert.deepEqual(markedText('<script>$inspect(a).with(b);</script>'), [
    '$inspect',
    '(',
    ')',
    'with',
    '(',
    ')',
  ]);
  assert.deepEqual(markedText('<script lang="ts">let a = $state<() => void>(b);</script>'), ['$state', '(', ')']);
  assert.deepEqual(markedText('<script>foo(); a.$state();</script>'), []);
});

test('marks the brackets in {@render}, but not the JS inside', () => {
  assert.deepEqual(markedText('{@render row(a)}'), ['{@render', '(', ')', '}']);
  assert.deepEqual(markedText('{@render row?.(a)}'), ['{@render', '(', ')', '}']);
  assert.deepEqual(markedText('{foo(a)}'), ['{', '}']);
});

test('marks a whole {#snippet} tag, apart from TypeScript', () => {
  assert.deepEqual(markedText('{#snippet row(a, b = 1)}x{/snippet}'), [
    '{#snippet',
    ' row',
    '(a',
    ', b = 1',
    ')',
    '}',
    '{/snippet}',
  ]);
  assert.deepEqual(markedText('{#snippet row()}{/snippet}'), ['{#snippet', ' row', '()', '}', '{/snippet}']);

  const typed = '<script lang="ts"></script>{#snippet row(run: () => void, a: T)})x{/snippet}';
  assert.deepEqual(markedText(typed), ['{#snippet', ' row', '(run', ', a', ')', '}', '{/snippet}']);
});

test('marks the names and the key after {#each ... as, but not the list', () => {
  assert.deepEqual(markedText('{#each a as b}x{/each}'), ['{#each', 'as', ' b', '}', '{/each}']);
  assert.deepEqual(markedText('{#each a as b, i (b.id)}x{/each}'), [
    '{#each',
    'as',
    ' b, i (b.id)',
    '}',
    '{/each}',
  ]);
  assert.deepEqual(markedText('{#each a as { b, c } (b)}{/each}'), [
    '{#each',
    'as',
    ' { b, c } (b)',
    '}',
    '{/each}',
  ]);
  assert.deepEqual(markedText('{#each a, i}x{/each}'), ['{#each', ', i', '}', '{/each}']);
  assert.deepEqual(markedText('{#each { length: 3 }, i }x{/each}'), ['{#each', ', i', '}', '{/each}']);
  assert.deepEqual(markedText('{#if (a)}x{/if}'), ['{#if', '}', '{/if}']);
});

test('marks the names an {#await} block creates, but not the promise', () => {
  assert.deepEqual(markedText('{#await a then b}x{/await}'), ['{#await', 'then', ' b', '}', '{/await}']);
  assert.deepEqual(markedText('{#await a}x{:then b}y{:catch c}z{/await}'), [
    '{#await',
    '}',
    '{:then',
    ' b',
    '}',
    '{:catch',
    ' c',
    '}',
    '{/await}',
  ]);
});

test('marks children from $props, wherever it is used', () => {
  const source = '<script>let { title, children } = $props();</script>\n{#if children}{@render children()}{/if}';
  assert.deepEqual(markedText(source), [
    'children',
    '$props',
    '(',
    ')',
    '{#if',
    'children',
    '}',
    '{@render',
    'children',
    '(',
    ')',
    '}',
    '{/if}',
  ]);
  assertUnmarked(source, 'title');
});

test('marks children, but not your own name for it', () => {
  const source = '<script>let { children: content } = $props();</script>\n{@render content()}';
  assert.deepEqual(markedText(source), ['children', '$props', '(', ')', '{@render', '(', ')', '}']);
});

test('finds children behind a default value, a rest element or a type', () => {
  const withDefault = '<script>let { children = a, ...rest } = $props();</script>\n{@render children()}';
  assert.deepEqual(markedText(withDefault), [
    'children',
    '$props',
    '(',
    ')',
    '{@render',
    'children',
    '(',
    ')',
    '}',
  ]);
  const typed = '<script lang="ts">let { children }: { children: Snippet } = $props();</script>';
  assert.deepEqual(markedText(typed), ['children', '$props', '(', ')']);
});

test('children only counts when it comes from $props', () => {
  const other = '<script>let { children } = other();</script>\n{@render children()}';
  assert.deepEqual(markedText(other), ['{@render', '(', ')', '}']);

  const hidden = '<script>let { children } = $props();\nlet a = b.children;</script>\n{#each c as children}{children}{/each}';
  assert.deepEqual(markedText(hidden), [
    'children',
    '$props',
    '(',
    ')',
    '{#each',
    'as',
    ' children',
    '}',
    '{',
    '}',
    '{/each}',
  ]);

  assert.deepEqual(markedText('let { children } = $props();', 'a.svelte.js'), ['$props', '(', ')']);
});

test('marks the props SvelteKit passes, but only in pages and layouts', () => {
  const source = '<script>let { data, form, params } = $props();</script>\n{data.a}{form?.b}{params.c}';
  const inPage = ['data', 'form', 'params', '$props', '(', ')', '{', 'data', '}', '{', 'form', '}', '{', 'params', '}'];
  assert.deepEqual(markedText(source, 'src/routes/+page.svelte'), inPage);
  assert.deepEqual(markedText(source, 'src/routes/(app)/+page@.svelte'), inPage);
  assert.deepEqual(markedText(source, 'src/routes/+layout.svelte'), [
    'data',
    'params',
    '$props',
    '(',
    ')',
    '{',
    'data',
    '}',
    '{',
    '}',
    '{',
    'params',
    '}',
  ]);
  const error = '<script>let { error } = $props();</script>{error.status}';
  assert.deepEqual(markedText(error, 'src/routes/+error.svelte'), [
    'error',
    '$props',
    '(',
    ')',
    '{',
    'error',
    '}',
  ]);
  assert.deepEqual(markedText(error, 'src/lib/Card.svelte'), ['$props', '(', ')', '{', '}']);
  assert.deepEqual(markedText(source, 'src/lib/Card.svelte'), [
    '$props',
    '(',
    ')',
    '{',
    '}',
    '{',
    '}',
    '{',
    '}',
  ]);
});

test('your own name for a SvelteKit prop stays unmarked, and so does a local one', () => {
  const page = 'src/routes/+page.svelte';
  const renamed = '<script>let { data: page } = $props();</script>\n{page.a}';
  assert.deepEqual(markedText(renamed, page), ['data', '$props', '(', ')', '{', '}']);
  const local = '<script>let { data } = $props();\nfunction a(data) { return data; }\nb.data;</script>';
  assert.deepEqual(markedText(local, page), ['data', '$props', '(', ')']);
  assertValidMarks(local, findMarks(local, page).marks);
  assert.deepEqual(markedText('<form></form>', page), []);
});

test('marks the brackets of :global, but not the selector inside', () => {
  const source = '<style>\n  :global(.a:not(.b)) { color: red; }\n  .c:not(.d) { color: red; }\n</style>';
  assert.deepEqual(markedText(source), [':global', '(', ')']);
  assertUnmarked(source, '.a:not(.b)');
  assertUnmarked(source, '.c:not(.d)');
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
      '#lib',
      'load',
      'params',
      'url',
      'actions',
      'default',
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
    new Set(['sequence', '@sveltejs/kit', 'handle', 'handleError', 'error']),
  );
});

test('marks route matchers', () => {
  assert.deepEqual(markedInSample('samples/src/params/slug.js'), new Set(['match']));
});

test('marks runes in .svelte.js files', () => {
  assert.deepEqual(markedInSample('samples/src/lib/counter.svelte.js'), new Set(['$state', '$derived', '(', ')']));
});

test('runes and special exports only count in the right kind of file', () => {
  const source = 'export function load() {}\nconst x = $state(0);';
  assert.deepEqual(markedText(source, 'src/lib/plain.js'), []);
  assert.deepEqual(markedText(source, 'src/routes/+page.js'), ['load']);
  assert.deepEqual(markedText(source, 'src/lib/plain.svelte.js'), ['$state', '(', ')']);
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
    '$lib',
    '#lib',
    '$env',
    '$app',
    'dev',
    '$app',
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

test('type imports mark their names, but not the word type', () => {
  const source = "import type { PageProps } from './$types';\nimport { type Page, error } from '@sveltejs/kit';";
  assert.deepEqual(markedText(source, 'a.ts'), ['PageProps', '$types', 'Page', 'error', '@sveltejs/kit']);
  assert.deepEqual(markedText("import type { Foo } from './foo';\nlet a: Foo;", 'a.ts'), []);
  assert.deepEqual(markedText("import type { Foo } from '$lib/foo';\nlet a: Foo;", 'a.ts'), ['$lib']);
});

test('an imported name inside a directive gets one mark', () => {
  const source = `<script>
  import { page } from '$app/state';
</script>
<p class:page>Hi</p>`;
  assert.deepEqual(markedText(source), ['page', '$app', 'class:page']);
});

test('only scans files that can hold Svelte code', () => {
  assert.equal(shouldScan('src/routes/+page.server.js', ''), true);
  assert.equal(shouldScan('src/hooks.server.ts', ''), true);
  assert.equal(shouldScan('src/lib/state.svelte.ts', ''), true);
  assert.equal(shouldScan('Component.svelte', ''), true);
  assert.equal(shouldScan('src/lib/uses-kit.js', "import '$app/state';"), true);
  assert.equal(shouldScan('src/lib/plain.js', 'const a = 1;'), false);
  assert.equal(shouldScan('src/app.d.ts', ''), true);
  assert.equal(shouldScan('src/app.d.ts', '', false), false);
  assert.equal(shouldScan('src/other.d.ts', "import '$app/state';"), false);
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
  assert.deepEqual(markedText(source), ['<Foo.Bar', '--size', '>', '</Foo.Bar>']);
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
    '<svelte:element',
    'this',
    '{',
    '}',
    '>',
    '</svelte:element>',
  ]);
  assert.deepEqual(markedText('<svelte:element this="h2">x</svelte:element>'), [
    '<svelte:element',
    'this',
    '>',
    '</svelte:element>',
  ]);
  assert.deepEqual(markedText('<svelte:options runes={true} />'), [
    '<svelte:options',
    'runes',
    '{',
    '}',
    '/>',
  ]);
});

test('marks <slot> and <enhanced:img>', () => {
  assert.deepEqual(markedText('<slot /><enhanced:img src="./a.jpg" />'), [
    '<slot',
    '/>',
    '<enhanced:img',
    '/>',
  ]);
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
  assert.deepEqual(markedText(source), [':global', '(', ')', ':global', '-global-']);
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
    new Set(['$state', '(', ')', 'export', 'snapshot', 'capture', 'restore', 'bind:value', '{', '}']),
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
  assert.deepEqual(markedText(snapshot, 'src/routes/+page.svelte'), ['export', 'snapshot', 'capture', 'restore']);
  const transport = 'export const transport = { V: { encode: (v) => v, decode: ({ x }) => x } };';
  assert.deepEqual(markedText(transport, 'src/hooks.ts'), ['transport', 'encode', 'decode']);
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
  assert.deepEqual(markedText(css), [':global', '(', ')']);
  assert.deepEqual(markedText(`<!--\n${css}\n-->`), []);
  assert.deepEqual(markedText(`<svelte:head>\n${css}\n</svelte:head>`), [
    '<svelte:head',
    '>',
    '</svelte:head>',
  ]);
  assert.deepEqual(markedText(`<script>\nconst a = \`\n${css}\n\`;\n</script>`), []);
});

test('style marks survive broken code', () => {
  const css = '<style>\n  :global(a) { color: red; }\n</style>';
  const brokenScript = `<script>let x = $state(</script>\n<p class:on>Hi</p>\n${css}`;
  assert.deepEqual(markedText(brokenScript), ['class:on', ':global', '(', ')']);
  const brokenBoth = `<script>let x = $state(</script>\n<p bind:>Hi</p>\n${css}`;
  assert.deepEqual(markedText(brokenBoth), [':global', '(', ')']);
});

test('leaves :global alone in CSS strings and trailing comments', () => {
  const source = `<style lang="scss">
  .a { color: red; } // was :global(.b)
  .c::before { content: ":global"; }
  [data-x=':global'] { color: red; }
  .d { background: url(http://a.b/c.png); } :global(.e) { color: red; }
</style>`;
  assert.deepEqual(markedText(source), [':global', '(', ')']);
});

test('marks -global- after browser-prefixed keyframes', () => {
  const source = '<style>\n@-webkit-keyframes -global-a {}\n@-moz-keyframes -global-b {}\n.-global-c {}\n</style>';
  assert.deepEqual(markedText(source), ['-global-', '-global-']);
});

test('svelte-ignore only counts at the start, and @component only in the markup', () => {
  assert.deepEqual(markedText('<!-- do not use svelte-ignore or @component here -->'), ['@component']);
  assert.deepEqual(markedText('<!--\n  @component\n  Docs\n-->'), ['@component']);
  assert.deepEqual(markedText('<!--\n  Docs\n  @component\n-->'), ['@component']);
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
    assert.deepEqual(markedText(source, path), ['$state', '(', ')'], path);
  }
  for (const path of ['a.test.ts', 'a.svelte.md', 'my.svelte/a.js']) {
    assert.deepEqual(markedText(source, path), [], path);
  }
  assert.equal(shouldScan('src/a.svelte.test.ts', ''), true);
});

test('finds closing tags by what they say, not by a pattern', () => {
  assert.deepEqual(markedText('<Foo.$Bar>x</Foo.$Bar>'), ['<Foo.$Bar', '>', '</Foo.$Bar>']);
  assert.deepEqual(markedText('<Foo$>x</Foo$>'), ['<Foo$', '>', '</Foo$>']);
  assert.deepEqual(markedText('<p><Foo></Foo></p>'), ['<Foo', '>', '</Foo>']);
  assert.deepEqual(markedText('<Foo></Foo  >'), ['<Foo', '>', '</Foo  >']);
  assert.deepEqual(markedText('<Foo /><p></p>'), ['<Foo', '/>']);
  assert.deepEqual(markedText('<Foo a="</Foo>" />'), ['<Foo', '/>']);
});

test('marks CSS variables only on components', () => {
  assert.deepEqual(markedText('<div --size="2px"></div>'), []);
  assert.deepEqual(markedText('<Foo --size="2px" />'), ['<Foo', '--size', '/>']);
  assert.deepEqual(markedText('<svelte:component this={A} --size="2px" />'), [
    '<svelte:component',
    'this',
    '{',
    '}',
    '--size',
    '/>',
  ]);
});

test('marks slot only on the direct child of a component', () => {
  assert.deepEqual(markedText('<Foo><div slot="a">x</div></Foo>'), ['<Foo', '>', 'slot', '</Foo>']);
  assert.deepEqual(markedText('<my-card><div slot="a">x</div></my-card>'), []);
  assert.deepEqual(markedText('<Foo><my-card><div slot="a">x</div></my-card></Foo>'), ['<Foo', '>', '</Foo>']);
  assert.deepEqual(markedText('<Foo><div class:slot>x</div></Foo>'), ['<Foo', '>', 'class:slot', '</Foo>']);
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
    'PageProps',
    '$types',
    '$state',
    '(',
    ')',
    '$state.raw',
    '(',
    ')',
    '{#snippet',
    ' row',
    '(item',
    ')',
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
  assert.deepEqual(markedText(source), ['$state', '(', ')']);
});

test('a special export is marked without its type', () => {
  const page = 'export const load: PageLoad<Params> = ({ params }) => params;\nexport const ssr: boolean = false;';
  assert.deepEqual(markedText(page, 'src/routes/+page.ts'), ['load', 'params', 'ssr']);
  const snapshot = '<script lang="ts">export const snapshot: Snapshot<string> = {};</script>';
  assert.deepEqual(markedText(snapshot, 'src/routes/+page.svelte'), ['export', 'snapshot']);
});

test('finds special exports that are destructured', () => {
  assert.deepEqual(markedText('export const { handle, signIn } = auth();', 'src/hooks.server.ts'), ['handle']);
  assert.deepEqual(markedText('export const { GET, POST = a, b: PUT } = c;', 'src/routes/+server.ts'), [
    'GET',
    'POST',
    'PUT',
  ]);
});

test('marks the Kit 3 exports in src/params and src/env', () => {
  const params = 'export const params = 1;\nexport const match = 2;';
  assert.deepEqual(markedText(params, 'src/params.ts'), ['params']);
  assert.deepEqual(markedText(params, 'src/params/index.js'), ['params']);
  assert.deepEqual(markedText(params, 'src/params/hex.ts'), ['match']);
  assert.deepEqual(markedText(params, 'src/lib/params.ts'), []);
  assert.deepEqual(markedText('export const variables = 1;', 'src/env.ts'), ['variables']);
  assert.deepEqual(markedText('export const variables = 1;', 'src/env/index.ts'), ['variables']);
  assert.deepEqual(markedText('export const variables = 1;', 'src/lib/env.ts'), []);
});

test('hooks can be a folder with an index file', () => {
  const source = 'export const handle = ({ event }) => event;';
  for (const path of ['src/hooks/index.ts', 'src/hooks.server/index.ts', 'src/hooks.client/index.js']) {
    assert.deepEqual(markedText(source, path), ['handle', 'event'], path);
    assert.equal(shouldScan(path, source), true, path);
  }
  assert.deepEqual(markedText(source, 'src/hooks/other.ts'), []);
});

test('paths only count as SvelteKit files in a SvelteKit project', () => {
  const hooks = 'export function handle(a) {}\nexport const init = ({ b }) => b;';
  assert.deepEqual(findMarks(hooks, 'src/hooks.ts', false).marks, []);
  assert.equal(shouldScan('src/hooks.ts', hooks, false), false);
  assert.deepEqual(findMarks('export function match() {}', 'src/params/a.ts', false).marks, []);
  assert.deepEqual(findMarks('export const load = 1;', 'src/routes/+page.ts', false).marks, [{ start: 13, end: 17 }]);
});

test('finds a SvelteKit project from the nearest package.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'svelte-marker-'));
  try {
    mkdirSync(join(root, 'apps/web/src'), { recursive: true });
    mkdirSync(join(root, 'packages/ui/src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{ "name": "monorepo", "devDependencies": { "@sveltejs/kit": "3" } }');
    writeFileSync(join(root, 'apps/web/package.json'), '{ "devDependencies": { "@sveltejs/kit": "3" } }');
    writeFileSync(join(root, 'packages/ui/package.json'), '{ "name": "ui" }');
    assert.equal(isKitProject(join(root, 'apps/web/src/hooks.ts')), true);
    assert.equal(isKitProject(join(root, 'packages/ui/src/hooks.ts')), false);
    assert.equal(isKitProject(join(tmpdir(), 'no-such-folder/src/hooks.ts')), true);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('marks a JS file that mentions </script>, and one with a #! line', () => {
  const closing = "export function GET({ url }) { return '</script>'; }";
  assert.deepEqual(findMarks(closing, 'src/routes/+server.ts').complete, true);
  assert.deepEqual(markedText(closing, 'src/routes/+server.ts'), ['GET', 'url']);
  const comment = '// use </script> here\nconst a = $state(0);';
  assert.deepEqual(markedText(comment, 'a.svelte.ts'), ['$state', '(', ')']);
  const hashbang = '#!/usr/bin/env node\nexport function load() {}';
  assert.equal(findMarks(hashbang, 'src/routes/+page.js').complete, true);
  assert.deepEqual(markedText(hashbang, 'src/routes/+page.js'), ['load']);
  assert.equal(findMarks(hashbang, 'src/routes/+page.js').marks[0].start, hashbang.indexOf('load'));
});

test('snippet parameters are marked without their TypeScript', () => {
  const ts = '<script lang="ts"></script>\n';
  assert.deepEqual(markedText(`${ts}{#snippet a(b?: string, c?: number)}{/snippet}`), [
    '{#snippet',
    ' a',
    '(b',
    ', c',
    ')',
    '}',
    '{/snippet}',
  ]);
  assert.deepEqual(markedText(`${ts}{#snippet a(b: number = 1, { c }: D = {})}{/snippet}`), [
    '{#snippet',
    ' a',
    '(b',
    ' = 1',
    ', { c }',
    ' = {}',
    ')',
    '}',
    '{/snippet}',
  ]);
  assert.deepEqual(markedText('{#snippet a(b = 1)}{/snippet}'), ['{#snippet', ' a', '(b = 1', ')', '}', '{/snippet}']);
});

test('generics in a snippet stay unmarked', () => {
  const ts = '<script lang="ts"></script>\n';
  const expected = ['{#snippet', ' a', '(b', ')', '}', '{/snippet}'];
  assert.deepEqual(markedText(`${ts}{#snippet a<T extends { c: 1 }>(b: T)}{/snippet}`), expected);
  assert.deepEqual(markedText(`${ts}{#snippet a<as>(b: as)}{/snippet}`), expected);
  assert.deepEqual(markedText(`${ts}{#snippet a<T = { then: 1 }>(b: T)}{/snippet}`), expected);
});

test('comments inside a tag are left alone', () => {
  assert.deepEqual(markedText('{#if /* then */ a}b{/if}'), ['{#if', '}', '{/if}']);
  assert.deepEqual(markedText('{#if a // as\n}b{/if}'), ['{#if', '}', '{/if}']);
  assert.deepEqual(markedText('{#each a /* as */ as b}c{/each}'), ['{#each', 'as', ' b', '}', '{/each}']);
  const greater = '<Foo a="1"\n// b > c\n>x</Foo>';
  assert.deepEqual(markedText(greater), ['<Foo', '>', '</Foo>']);
  assert.equal(findMarks(greater).marks[1].start, greater.lastIndexOf('>x'));
  assert.deepEqual(markedText('<Foo a="1" /* b > c */ />'), ['<Foo', '/>']);
});

test('a block only hides a name in the parts that can see it', () => {
  const imports = "<script>import { page } from '$app/state';</script>\n";
  const pageCount = (markup: string) => markedText(imports + markup).filter((text) => text === 'page').length;
  assert.equal(pageCount('{#each page.a as page}{page.b}{/each}'), 2);
  assert.equal(pageCount('{#each a as page (page.id)}{page.b}{/each}'), 1);
  assert.equal(pageCount('{#each a as page}{page.b}{:else}{page.c}{/each}'), 2);
  assert.equal(pageCount('{#await page.a}{page.b}{:then page}{page.c}{/await}'), 3);
  assert.equal(pageCount('{#await a then b}{:catch page}{page.c}{/await}'), 1);
  assert.equal(pageCount('{#await a then page}{page.b}{:catch e}{page.c}{/await}'), 2);
});

test('a snippet hides an imported name where it can be seen', () => {
  const imports = "<script>import { page } from '$app/state';</script>\n";
  const pageCount = (markup: string) => markedText(imports + markup).filter((text) => text === 'page').length;
  assert.equal(pageCount('{#snippet page()}x{/snippet}{@render page()}'), 1);
  assert.equal(pageCount('<div>{#snippet page()}x{/snippet}</div>{page.a}'), 2);
});

test('var hides an imported name in the whole function', () => {
  const imports = "import { error } from '@sveltejs/kit';\n";
  const code = 'function a(b) { if (b) { var error = 1; } return error; }';
  assert.deepEqual(markedText(imports + code, 'a.js'), ['error', '@sveltejs/kit']);
  const inner = 'function a() { function b() { var error = 1; } return error; }';
  assert.deepEqual(markedText(imports + inner, 'a.js'), ['error', '@sveltejs/kit', 'error']);
});

test('TypeScript-only code never counts as using a name', () => {
  const imports = "import { error } from '@sveltejs/kit';\n";
  const typesOnly = [
    'interface A { m(error: string): void; (error: number): void; new (error: number): A; }',
    'declare function a(error: string): void;',
    'function a(error: string): void;\nfunction a(b: any) {}',
    'abstract class A { abstract m(error: string): void; }',
    'class A { m(error: string): void; m(b: any) {} }',
    'class A { constructor(private error: string) { error; } }',
    'namespace N { const error = 1; error; }',
  ];
  for (const code of typesOnly) {
    assert.deepEqual(markedText(imports + code, 'a.ts'), ['error', '@sveltejs/kit'], code);
  }
});

test('marks the $$ names in types', () => {
  const source = `<script lang="ts">
  type $$Props = { a: string };
  interface $$Slots { b: {} }
  type Option = $$Generic;
  let c: $$Props['a'];
  let d: Foo<$$Events>;
</script>`;
  assert.deepEqual(markedText(source), ['$$Props', '$$Slots', '$$Generic', '$$Props', '$$Events']);
  assert.deepEqual(markedText('type $$Props = {};', 'a.ts'), []);
  assert.deepEqual(markedText('<script lang="ts">import type $Own from "./a";\nlet a: $Own;</script>'), []);
  assert.deepEqual(markedText('<script lang="ts">let a: typeof $count;</script>'), ['$count']);
});

test('marks Svelte names used in types, and no other TypeScript', () => {
  const source = `import type { Snippet } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { PageLoad } from './$types';
const load: PageLoad = (a) => a as PageLoad;
let b: { c: Snippet<[string]>; d: Own };
let e: SvelteMap<string, number>;
function f(g: Snippet): Snippet { return g; }
interface H extends Snippet { i(j: Snippet): void; }
type K = typeof SvelteMap;`;
  const count = (name: string) => markedText(source, 'a.ts').filter((text) => text === name).length;
  assert.equal(count('Snippet'), 6);
  assert.equal(count('PageLoad'), 3);
  assert.equal(count('SvelteMap'), 3);
  for (const text of ['string', 'number', 'Own', 'H', 'K', ':']) assert.equal(count(text), 0, text);
});

test('a generic hides an imported type', () => {
  const imports = "import type { Page } from '@sveltejs/kit';\n";
  for (const code of ['function a<Page>(b: Page) {}', 'class A<Page> { b: Page; }', 'type A<Page> = Page;', 'interface A<Page> { b: Page }']) {
    assert.deepEqual(markedText(imports + code, 'a.ts'), ['Page', '@sveltejs/kit'], code);
  }
});

test('marks import paths and names in JSDoc and in types', () => {
  const jsdoc = "/** @type {import('./$types').PageLoad} */\nexport function load() {}";
  assert.deepEqual(markedText(jsdoc, 'src/routes/+page.js'), ['$types', 'PageLoad', 'load']);
  assert.deepEqual(markedText("/** @type {import('@sveltejs/kit/hooks').Handle} */", 'a.js'), [
    '@sveltejs/kit',
    'Handle',
  ]);
  assert.deepEqual(markedText("/** @type {import('$lib/a').B} */", 'a.js'), ['$lib']);
  assert.deepEqual(markedText("/** @type {import('./a').B} */", 'a.js'), []);
  assert.deepEqual(markedText("// import('./$types').PageLoad", 'a.js'), []);
  assert.deepEqual(markedText("let a: import('./$types').PageData;", 'a.ts'), ['$types', 'PageData']);
  assert.deepEqual(markedText("let a: import('./own').Foo;", 'a.ts'), []);
  assert.deepEqual(markedText("import a from './$types.d.ts';", 'a.ts'), ['a', '$types']);
});

test('finds JSDoc paths in an indented comment of several lines', () => {
  const source = `<script>
\t/**
\t * @type {import('svelte').Snippet}
\t * @type {import('./$types').PageData}
\t */
\tlet a;
</script>`;
  assert.deepEqual(markedText(source), ['svelte', 'Snippet', '$types', 'PageData']);
  const ignored = '<script>\n\t/*\n\t  svelte-ignore a\n\t*/\n</script>';
  assert.deepEqual(markedText(ignored), ['svelte-ignore']);
});

test('marks members of a whole imported module', () => {
  const source = "import * as kit from '@sveltejs/kit';\nkit.error(404);\nlet a: kit.Handle;\nfunction b(kit) { kit.error(); }";
  assert.deepEqual(markedText(source, 'a.ts'), ['* as kit', '@sveltejs/kit', 'kit', 'error', 'kit.Handle']);
});

test('marks re-exported names', () => {
  assert.deepEqual(markedText("export { page, navigating as n } from '$app/state';", 'a.ts'), [
    'page',
    'navigating as n',
    '$app',
  ]);
  assert.deepEqual(markedText("export { a } from './b';", 'a.ts'), []);
});

test('marks names from a dynamic import', () => {
  const named = "const { goto } = await import('$app/navigation');\ngoto('/');";
  assert.deepEqual(markedText(named, 'a.ts'), ['goto', '$app', 'goto']);
  const inFunction = "async function a() {\n  const { goto } = await import('$app/navigation');\n  goto('/');\n}";
  assert.deepEqual(markedText(inFunction, 'a.ts'), ['goto', '$app', 'goto']);
  const whole = "const kit = await import('@sveltejs/kit');\nkit.error(404);";
  assert.deepEqual(markedText(whole, 'a.ts'), ['kit', '@sveltejs/kit', 'kit', 'error']);
  assert.deepEqual(markedText("import('svelte/store').then(({ get }) => get(a));", 'a.ts'), ['svelte', 'get']);
  assert.deepEqual(markedText("const { a } = await import('./b');\na();", 'a.ts'), []);
});

test('marks the keys SvelteKit knows by name', () => {
  const actions = 'export const actions = { default: async () => {}, other: async () => {} };';
  assert.deepEqual(markedText(actions, 'src/routes/+page.server.ts'), ['actions', 'default']);
  const handle = `export const handle = ({ event, resolve }) => resolve(event, {
  transformPageChunk: ({ html }) => html,
  filterSerializedResponseHeaders: () => true,
  preload: () => true,
  other: 1,
});`;
  assert.deepEqual(markedText(handle, 'src/hooks.server.ts'), [
    'handle',
    'event',
    'resolve',
    'transformPageChunk',
    'filterSerializedResponseHeaders',
    'preload',
  ]);
  assert.deepEqual(markedText('resolve(a, { preload: 1 });', 'src/lib/a.svelte.ts'), []);
});

test('marks provided values inside a wrapper', () => {
  const load = 'export const load = wrap(async ({ params }) => params);';
  assert.deepEqual(markedText(load, 'src/routes/+page.ts'), ['load', 'params']);
  const actions = 'export const actions = wrap({ save: async ({ request }) => request });';
  assert.deepEqual(markedText(actions, 'src/routes/+page.server.ts'), ['actions', 'request']);
  const hooks = 'export const handle = sequence(({ event, resolve }) => resolve(event), other);';
  assert.deepEqual(markedText(hooks, 'src/hooks.server.ts'), ['handle', 'event', 'resolve']);
});

test('marks the props of svelte:boundary', () => {
  const source = '<svelte:boundary onerror={a} pending={b} failed={c}>d</svelte:boundary><div onerror={a}></div>';
  assert.deepEqual(markedText(source).filter((text) => /^[a-z]+$/.test(text)), ['onerror', 'pending', 'failed']);
  assert.deepEqual(markedText('<svelte:boundary {onerror} />'), ['<svelte:boundary', '{', 'onerror', '}', '/>']);
});

test('marks the App namespace', () => {
  const declaration = `declare global {
  namespace App {
    interface Locals { a: string }
    interface PageData {}
    interface Other {}
  }
}
export {};`;
  assert.deepEqual(markedText(declaration, 'src/app.d.ts'), ['App', 'Locals', 'PageData']);
  assert.deepEqual(markedText('let a: App.Locals;\nlet b: App;', 'src/lib/a.ts'), ['App.Locals']);
  assert.equal(shouldScan('src/lib/a.ts', 'let a: App.Locals;'), true);
  assert.deepEqual(findMarks('let a: App.Locals;', 'a.ts', false).marks, []);
});

test('reads the longer ways of asking for TypeScript', () => {
  for (const attribute of ['lang="typescript"', "lang='typescript'", 'type="text/typescript"']) {
    const source = `<script ${attribute}>let a: number = $state(1);</script>\n<p>{a}</p>`;
    assert.equal(findMarks(source).complete, true, attribute);
    assert.deepEqual(markedText(source), ['$state', '(', ')', '{', '}'], attribute);
  }
});

test('finds a style block that shares a line with other code', () => {
  assert.deepEqual(markedText('<p>a</p><style>:global(.b) {}</style>'), [':global', '(', ')']);
  assert.deepEqual(markedText('<script>let a;</script><style>:global(.b) {}</style>'), [':global', '(', ')']);
  const scss = '<p class:a>b</p><style lang="scss">$c: 1; :global(.d) {}</style>';
  assert.equal(findMarks(scss).complete, true);
  assert.deepEqual(markedText(scss), ['class:a', ':global', '(', ')']);
});

test('a style in a script or comment is not a style block', () => {
  const string = "<script>const a = '<style>';</script>\n<p class:b>c</p>\n<style>:global(.d) {}</style>";
  assert.equal(findMarks(string).complete, true);
  assert.deepEqual(markedText(string), ['class:b', ':global', '(', ')']);
  assert.deepEqual(markedText('<p>a</p><!-- <style>:global(.b) {}</style> -->'), []);
  assert.deepEqual(markedText('<div><style>:global(.b) {}</style></div>'), []);
});

test('a broken script keeps the markup marks when it is indented', () => {
  const source = '  <script>let a = $state(</script>\n<p class:b>c</p>';
  assert.equal(findMarks(source).complete, false);
  assert.deepEqual(markedText(source), ['class:b']);
});

test('svelte-ignore counts in modules with runes', () => {
  const source = '// svelte-ignore state_referenced_locally\nlet a = $state(1);';
  assert.deepEqual(markedText(source, 'a.svelte.ts'), ['svelte-ignore', '$state', '(', ')']);
});

test('scans a file that only mentions $service-worker', () => {
  assert.equal(shouldScan('src/service-worker.js', "import { build } from '$service-worker';"), true);
});

test('only marks :global itself, not a longer word', () => {
  assert.deepEqual(markedText('<style>:global-x {}\n.a:globalb {}\n:global .c {}</style>'), [':global']);
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
