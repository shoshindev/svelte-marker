// Finds every Svelte-specific piece of a file.
//
// This file knows nothing about VS Code: text goes in, positions come out.
// That keeps it easy to test (see test/findMarks.test.ts).
//
// The real work is done by Svelte's own parser, which turns a file into a tree
// of "nodes": one for each element, directive, block, function call and so on.
// We walk that tree and note where the Svelte-specific nodes are.

import { parse } from 'svelte/compiler';
import {
  allowsRunes,
  importsOwnNames,
  MARKED_IMPORT,
  RUNES,
  specialExports,
} from './svelteNames.ts';

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

// What marksIn needs to know about the text it's parsing.
interface ParseOptions {
  offset: number; // how far the real file starts into the parsed text
  runes: boolean; // whether runes work in this file
  exportNames: string[]; // exports that mean something special in this file
}

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

// Svelte's parser only reads components, so a .js or .ts file gets wrapped in
// this tag first, which makes it look like a component with only a script.
const SCRIPT_OPENING = '<script lang="ts">';
const SCRIPT_CLOSING = '\n</script>';

// Fields that hold parser bookkeeping or TypeScript types, never running code.
const SKIPPED_FIELDS = new Set([
  'metadata',
  'typeAnnotation',
  'typeParameters',
  'typeArguments',
  'returnType',
]);

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
    if (field === 'metadata') continue;
    for (const item of [value].flat()) {
      if (item?.type === 'Fragment') children.push(...item.nodes);
      else if (typeof item?.start === 'number') children.push(item);
    }
  }
  return children.sort((a, b) => a.start - b.start);
}

// Lists the names a pattern creates: `{ a, b: [c] }` creates a and c.
function patternNames(pattern: any): string[] {
  switch (pattern?.type) {
    case 'Identifier':
      return [pattern.name];
    case 'ObjectPattern':
      return pattern.properties.flatMap((item: Node) => patternNames(item.value ?? item.argument));
    case 'ArrayPattern':
      return pattern.elements.flatMap(patternNames);
    case 'AssignmentPattern':
      return patternNames(pattern.left);
    case 'RestElement':
      return patternNames(pattern.argument);
    default:
      return [];
  }
}

function declaredNames(statement: any): string[] {
  if (statement?.type === 'VariableDeclaration') {
    return statement.declarations.flatMap((item: Node) => patternNames(item.id));
  }
  return statement?.type === 'FunctionDeclaration' && statement.id ? [statement.id.name] : [];
}

// Lists the local names a node creates for the code inside it. In
// `catch (error) { ... }`, `error` is a local variable, not SvelteKit's error().
function localNames(node: Node): string[] {
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return node.params.flatMap(patternNames);
    case 'CatchClause':
      return patternNames(node.param);
    case 'BlockStatement':
      return node.body.flatMap(declaredNames);
    case 'ForStatement':
      return declaredNames(node.init);
    case 'ForInStatement':
    case 'ForOfStatement':
      return declaredNames(node.left);
    case 'Fragment':
      return node.nodes.flatMap((item: Node) => declaredNames(item.declaration));
    case 'EachBlock':
      return [...patternNames(node.context), node.index].filter(Boolean);
    case 'SnippetBlock':
      return node.parameters.flatMap(patternNames);
    case 'AwaitBlock':
      return [...patternNames(node.value), ...patternNames(node.error)];
    default:
      return [];
  }
}

// Is this name being used as a value? In `o.error`, `{ error: 1 }` and
// `const error`, the word `error` is a label or a new name, not a use of one.
function isUse(parent: Node | undefined, field: string | undefined): boolean {
  if (parent?.computed) return true; // o[error] and { [error]: 1 } do use it
  if (parent?.type === 'MemberExpression' && field === 'property') return false;
  return field !== 'key' && field !== 'id' && field !== 'label' && field !== 'exported';
}

// Two marks on the same text would paint the translucent color twice and look
// darker. This happens with `class:page` when `page` is also an imported name.
function withoutOverlaps(marks: Mark[]): Mark[] {
  const sorted = [...marks].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Mark[] = [];
  for (const mark of sorted) {
    if (mark.start >= (kept.at(-1)?.end ?? 0)) kept.push(mark);
  }
  return kept;
}

// Parses one piece of text and returns its marks, or null if it can't be parsed.
function marksIn(text: string, options: ParseOptions): Mark[] | null {
  let ast;
  try {
    // `modern` asks for the current tree format. `loose` tells the parser to
    // put up with some mistakes, such as an unclosed block.
    ast = parse(text, { modern: true, loose: true });
  } catch {
    return null;
  }

  const marks: Mark[] = [];

  // Names imported from Svelte or SvelteKit, like `redirect` or `goto`.
  const ownNames = new Set<string>();

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

  // Marks `redirect` in `import { redirect } from '@sveltejs/kit'`, and notes
  // the name so its uses get marked too. Type-only imports don't run anything.
  function markImportedNames(node: Node) {
    if (node.importKind === 'type' || !importsOwnNames(node.source.value)) return;
    for (const specifier of node.specifiers) {
      if (specifier.importKind === 'type') continue;
      ownNames.add(specifier.local.name);
      add(specifier.start, specifier.end);
    }
  }

  // SvelteKit calls these functions and passes them values, so `params` in
  // `load({ params })` is SvelteKit's. Only that one spot is marked: further
  // down, `params` reads like any other variable.
  function markProvidedValues(value: any) {
    // Skip past TypeScript wrappers like `{ ... } satisfies Actions`.
    while (value?.expression && value.type.startsWith('TS')) value = value.expression;

    if (value?.type === 'ObjectExpression') {
      // `actions` is an object of functions, so check each one.
      for (const property of value.properties) markProvidedValues(property.value);
    } else if (value?.params?.[0]?.type === 'ObjectPattern') {
      for (const property of value.params[0].properties) {
        if (property.key) add(property.key.start, property.key.end);
      }
    }
  }

  function markSpecialExport(id: Node | null, value: any) {
    if (!id || !options.exportNames.includes(id.name)) return;
    add(id.start, id.end);
    markProvidedValues(value);
  }

  function markSpecialExports(node: Node) {
    const declaration = node.declaration;
    if (declaration?.type === 'FunctionDeclaration') {
      markSpecialExport(declaration.id, declaration);
    } else if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) markSpecialExport(item.id, item.init);
    }
  }

  function markNode(node: Node, hidden: Set<string>, parent?: Node, field?: string) {
    if (TAG_NODES.has(node.type)) markTagSyntax(node);
    else if (node.type.endsWith('Directive')) markDirective(node);
    else if (node.type.startsWith('Svelte')) markElementName(node.name, node.start, endOf(node));
    else if (node.type === 'CallExpression' && options.runes) markRune(node);
    else if (node.type === 'Attribute' && node.name.startsWith('data-sveltekit-')) {
      add(node.start, node.start + node.name.length);
    } else if (node.type === 'Identifier' && ownNames.has(node.name)) {
      if (!hidden.has(node.name) && isUse(parent, field)) add(node.start, node.end);
    }

    // Import, re-export and dynamic import() nodes all have a `source`.
    const importPath = node.source?.value;
    if (typeof importPath === 'string' && MARKED_IMPORT.test(importPath)) {
      add(node.source.start + 1, node.source.end - 1); // the 1s skip the quotes
    }
  }

  // Goes through the whole tree, marking every node it meets. `hidden` holds the
  // local names that are hiding an imported name at this point in the code.
  function visit(value: any, hidden: Set<string>, parent?: Node, field?: string) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, hidden, parent, field);
      return;
    }
    if (value === null || typeof value !== 'object') return;

    if (typeof value.type === 'string') {
      const locals = localNames(value);
      if (locals.length > 0) hidden = new Set([...hidden, ...locals]);
      markNode(value, hidden, parent, field);
      if (value.type === 'ImportDeclaration') return; // markImportedNames handled these
    }

    for (const [childField, child] of Object.entries(value)) {
      if (!SKIPPED_FIELDS.has(childField)) visit(child, hidden, value, childField);
    }
  }

  // Imports and exports can only sit at the top of a script, so read them first:
  // the walk below needs to know the imported names before it meets their uses.
  for (const script of [ast.module, ast.instance]) {
    for (const statement of (script?.content.body ?? []) as any[]) {
      if (statement.type === 'ImportDeclaration') markImportedNames(statement);
      if (statement.type === 'ExportNamedDeclaration') markSpecialExports(statement);
    }
  }

  // <svelte:options> is the one special element that isn't in the tree as a node.
  if (ast.options) markElementName('svelte:options', ast.options.start, ast.options.end);
  visit(ast.module, new Set());
  visit(ast.instance, new Set());
  visit(ast.fragment, new Set());

  return withoutOverlaps(marks).map((mark) => ({
    start: mark.start - options.offset,
    end: mark.end - options.offset,
  }));
}

function findComponentMarks(source: string): MarkResult {
  const options = { offset: 0, runes: true, exportNames: [] };

  // Nothing in CSS gets marked, and the parser can't read SCSS, so skip it all.
  const text = source.replace(STYLE_BLOCK, blankOut);

  // The normal case: the whole file parses.
  const wholeFile = marksIn(text, options);
  if (wholeFile) return { marks: wholeFile, complete: true };

  // Something is broken. Try each part alone, so an error in one doesn't lose
  // the marks in the other.
  const markup = marksIn(text.replace(SCRIPT_BLOCK, blankOut), options);
  const scripts = marksIn(keepOnlyScripts(text), options);
  return { marks: [...(markup ?? []), ...(scripts ?? [])], complete: false };
}

function findModuleMarks(source: string, filePath: string): MarkResult {
  const marks = marksIn(SCRIPT_OPENING + source + SCRIPT_CLOSING, {
    offset: SCRIPT_OPENING.length,
    runes: allowsRunes(filePath),
    exportNames: specialExports(filePath),
  });
  return { marks: marks ?? [], complete: marks !== null };
}

export function findMarks(source: string, filePath = 'Component.svelte'): MarkResult {
  return filePath.endsWith('.svelte') ? findComponentMarks(source) : findModuleMarks(source, filePath);
}
