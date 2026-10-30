// Tests for the detection logic. They run in plain Node, without VS Code:
//   npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compile } from 'svelte/compiler';
import { findMarks, RUNES, type Mark } from '../src/findMarks.ts';

function readProjectFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const modern = readProjectFile('samples/test.svelte');
const legacy = readProjectFile('samples/legacy.svelte');

function markedText(source: string): string[] {
  return findMarks(source).marks.map((mark) => source.slice(mark.start, mark.end));
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
    '}',
    '{/if}',
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
  assertUnmarked(modern, "'svelte/transition'");
  assertUnmarked(modern, "'./local.css'");
  assertUnmarked(modern, 'count > 10');
  assertUnmarked(modern, '={count > 0}');
  assertUnmarked(modern, ':global(body)');
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
  for (const sample of [modern, legacy]) {
    for (let length = 0; length <= sample.length; length++) {
      const source = sample.slice(0, length);
      assertValidMarks(source, findMarks(source).marks);
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
