// Finds every Svelte-specific piece of a .svelte file.
//
// This file knows nothing about VS Code: text goes in, positions come out.
// That keeps it easy to test (see test/findMarks.test.ts).
//
// The real work is done by Svelte's own parser, which turns a file into a tree
// of "nodes": one for each element, directive, block, function call and so on.
// We walk that tree and note where the Svelte-specific nodes are.

import { parse } from 'svelte/compiler';

// One highlighter stroke, as character offsets into the file.
export interface Mark {
  start: number;
  end: number;
}

export interface MarkResult {
  marks: Mark[];
  // False when part of the file couldn't be parsed, so `marks` may be missing some.
  complete: boolean;
}

// A node from the parser's tree. Nodes come in dozens of shapes, so we describe
// only what they all share and leave the rest loosely typed.
interface Node {
  type: string;
  start: number;
  end: number;
  [field: string]: any;
}

// Every rune in the Svelte docs. `$inspect(...).with` isn't here because it
// has a different shape; markRune handles it separately.
export const RUNES = new Set([
  '$state',
  '$state.raw',
  '$state.snapshot',
  '$state.eager',
  '$derived',
  '$derived.by',
  '$effect',
  '$effect.pre',
  '$effect.tracking',
  '$effect.pending',
  '$effect.root',
  '$props',
  '$props.id',
  '$bindable',
  '$inspect',
  '$inspect.trace',
  '$host',
]);

// Import paths that only mean something in a SvelteKit project. This includes
// older names like $lib and $env/*, because plenty of code still uses them.
const KIT_IMPORT = /^(\$lib|#lib|\$app|\$env|\$service-worker|@sveltejs\/kit)(\/|$)|\/\$types(\.js)?$/;

// Node types that have their own {...} syntax.
const TAG_NODES = new Set([
  'IfBlock',
  'EachBlock',
  'AwaitBlock',
  'KeyBlock',
  'SnippetBlock',
  'HtmlTag',
  'RenderTag',
  'DebugTag',
  'AttachTag',
  'ConstTag',
  'DeclarationTag',
]);

// The Svelte syntax inside those nodes: {#if  {:else if  {:else}  {/if}  {@html
// {let  {const  a closing }  and the words `as`, `then` and `catch`.
const TAG_SYNTAX = /\{\s*(?:[#:@/][a-z]+(?:\s+if\b)?|const\b|let\b)(?:\s*\})?|\}|\b(?:as|then|catch)\b/g;

const STYLE_BLOCK = /^[ \t]*<style\b[\s\S]*?<\/style\s*>/gm;
const SCRIPT_BLOCK = /^<script\b[\s\S]*?<\/script\s*>/gm;

// Swaps text for spaces but keeps every line break, so all the character
// offsets stay the same as in the real file.
function blankOut(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

// Blanks out everything except the top-level <script> blocks.
function keepOnlyScripts(text: string): string {
  let result = blankOut(text);
  for (const match of text.matchAll(SCRIPT_BLOCK)) {
    const end = match.index + match[0].length;
    result = result.slice(0, match.index) + match[0] + result.slice(end);
  }
  return result;
}

// Lists a node's direct children, including the contents of any Fragment
// (the parser's name for a list of nodes, like the inside of an {#if}).
function childrenOf(node: Node): Node[] {
  const children: Node[] = [];
  for (const [field, value] of Object.entries(node)) {
    if (field === 'metadata') continue; // parser bookkeeping, not part of the tree
    for (const item of [value].flat()) {
      if (item?.type === 'Fragment') children.push(...item.nodes);
      else if (typeof item?.start === 'number') children.push(item);
    }
  }
  return children.sort((a, b) => a.start - b.start);
}

// Parses one piece of text and returns its marks, or null if it can't be parsed.
function marksIn(text: string): Mark[] | null {
  let ast;
  try {
    // `modern` asks for the current tree format. `loose` tells the parser to
    // put up with some mistakes, such as an unclosed block.
    ast = parse(text, { modern: true, loose: true });
  } catch {
    return null;
  }

  const marks: Mark[] = [];

  function add(start: number, end: number) {
    if (start < end) marks.push({ start, end });
  }

  // In loose mode an unclosed block has an end of -1, meaning "never closed".
  function endOf(node: Node): number {
    return node.end < 0 ? text.length : node.end;
  }

  // Marks only the syntax between two positions. Used for the gaps in a block.
  function markSyntaxBetween(start: number, end: number) {
    for (const match of text.slice(start, end).matchAll(TAG_SYNTAX)) {
      add(start + match.index, start + match.index + match[0].length);
    }
  }

  // The parser has no node for {:else} or {/if}. So we step through a block's
  // children and look in the gaps between them: anything there that isn't a
  // child belongs to the block itself. This also keeps the JS unmarked, because
  // an expression like `count > 0` is a child.
  function markTagSyntax(node: Node) {
    let position = node.start;
    // {@const} and {let} keep their parts one level down, in `declaration`.
    for (const child of childrenOf(node.declaration ?? node)) {
      markSyntaxBetween(position, child.start);
      position = Math.max(position, endOf(child));
    }
    markSyntaxBetween(position, endOf(node));
  }

  // "bind:value={name}" becomes "bind:value". The "={name}" part is plain JS.
  function markDirective(node: Node) {
    const name = text.slice(node.start, endOf(node)).match(/^[a-z]+:[^\s=>/]+/);
    if (name) add(node.start, node.start + name[0].length);
  }

  // Marks "svelte:head" in both tags, but not the "<" and ">" around it.
  function markElementName(name: string, start: number, end: number) {
    add(start + 1, start + 1 + name.length);
    const closingTag = text.slice(start, end).match(new RegExp(`</${name}\\s*>$`));
    if (closingTag) {
      const nameStart = start + closingTag.index! + 2;
      add(nameStart, nameStart + name.length);
    }
  }

  // Every rune is a function call, so `foo.$state()` and strings can't match.
  function markRune(call: Node) {
    const callee = call.callee;
    if (RUNES.has(text.slice(callee.start, callee.end))) {
      add(callee.start, callee.end);
    } else if (callee.property?.name === 'with' && callee.object?.callee?.name === '$inspect') {
      // In `$inspect(x).with(fn)`, the walk reaches `$inspect` by itself.
      add(callee.property.start, callee.property.end);
    }
  }

  function markNode(node: Node) {
    if (TAG_NODES.has(node.type)) markTagSyntax(node);
    else if (node.type.endsWith('Directive')) markDirective(node);
    else if (node.type.startsWith('Svelte')) markElementName(node.name, node.start, endOf(node));
    else if (node.type === 'CallExpression') markRune(node);

    // Import, re-export and dynamic import() nodes all have a `source`.
    const importPath = node.source?.value;
    if (typeof importPath === 'string' && KIT_IMPORT.test(importPath)) {
      add(node.source.start + 1, node.source.end - 1); // the 1s skip the quotes
    }
  }

  // Goes through the whole tree, marking every node it meets.
  function visit(value: any) {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value !== null && typeof value === 'object') {
      if (typeof value.type === 'string') markNode(value);
      for (const [field, child] of Object.entries(value)) {
        if (field !== 'metadata') visit(child);
      }
    }
  }

  // <svelte:options> is the one special element that isn't in the tree as a node.
  if (ast.options) markElementName('svelte:options', ast.options.start, ast.options.end);
  visit(ast.module);
  visit(ast.instance);
  visit(ast.fragment);

  return marks;
}

export function findMarks(source: string): MarkResult {
  // Nothing in CSS gets marked, and the parser can't read SCSS, so skip it all.
  const text = source.replace(STYLE_BLOCK, blankOut);

  // The normal case: the whole file parses.
  const wholeFile = marksIn(text);
  if (wholeFile) return { marks: wholeFile, complete: true };

  // Something is broken. Try each part alone, so an error in one doesn't lose
  // the marks in the other.
  const markup = marksIn(text.replace(SCRIPT_BLOCK, blankOut));
  const scripts = marksIn(keepOnlyScripts(text));
  return { marks: [...(markup ?? []), ...(scripts ?? [])], complete: false };
}
