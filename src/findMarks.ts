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
  isKitTemplate,
  kitProps,
  markedImportPart,
  RUNES,
  SCRIPT_ATTRIBUTES,
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
  component: boolean; // whether this is a .svelte file
  runes: boolean; // whether runes work in this file
  exportNames: string[]; // exports that mean something special in this file
  propNames: string[]; // props whose names Svelte or SvelteKit fixes in this file
  styleMarks: Mark[]; // what the patterns found in <style> blocks
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

// Function nodes. An `await` inside one is plain JS, even in the markup.
const FUNCTION_NODES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

// The nodes that take `slot` children and CSS variables.
const COMPONENT_NODES = new Set(['Component', 'SvelteComponent', 'SvelteSelf']);

// The words that turn an ordinary comment into an instruction for Svelte. They
// only count at the very start of a comment, and @component only in the markup.
const MARKUP_COMMENT_KEYWORD = /(?<=^\s*)(?:svelte-ignore(?=\s)|@component\b)/;
const SCRIPT_COMMENT_KEYWORD = /(?<=^\s*)svelte-ignore(?=\s)/;

// CSS is read with patterns rather than the parser, which can't read SCSS.
const CSS_SYNTAX = /:global\b|(?<=@(?:-[a-z]+-)?keyframes\s+)-global-/g;

// The parts of CSS to ignore: comments and strings. `url(...)` is here so that
// the `//` in `url(http://a.b)` doesn't look like a comment.
const CSS_NON_CODE =
  /\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|url\([^)]*\)|\/\/.*$/gm;

// The only Svelte syntax in SvelteKit's app.html and error.html.
const KIT_TEMPLATE_SYNTAX = /%sveltekit\.[\w.]+%|data-sveltekit-[a-z-]+/g;

// The (?=...) stops these matching custom elements like <style-guide>.
const STYLE_BLOCK = /^[ \t]*<style(?=[\s/>])[\s\S]*?<\/style\s*>/gm;
const SCRIPT_BLOCK = /^<script(?=[\s/>])[\s\S]*?<\/script\s*>/gm;

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

// Lists the names a pattern creates: `{ a, b: [c] }` creates a and c. The parser
// reads the pattern in `let:item={{ a, b }}` as an expression, so those count too.
function patternNames(pattern: any): string[] {
  switch (pattern?.type) {
    case 'Identifier':
      return [pattern.name];
    case 'ObjectPattern':
    case 'ObjectExpression':
      return pattern.properties.flatMap((item: Node) => patternNames(item.value ?? item.argument));
    case 'ArrayPattern':
    case 'ArrayExpression':
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
  const hasName = statement?.type === 'FunctionDeclaration' || statement?.type === 'ClassDeclaration';
  return hasName ? patternNames(statement.id) : [];
}

// Lists the names a `let:` directive creates: `let:item` creates item, and
// `let:item={row}` creates row.
function letNames(attribute: Node): string[] {
  if (attribute.type !== 'LetDirective') return [];
  return attribute.expression ? patternNames(attribute.expression) : [attribute.name];
}

// Lists the local names a node creates for the code inside it. In
// `catch (error) { ... }`, `error` is a local variable, not SvelteKit's error().
function localNames(node: Node, parent?: Node): string[] {
  // The `id` is here for `function error() {}` used as a value: inside it, `error`
  // means that function.
  if (FUNCTION_NODES.has(node.type)) {
    return [...patternNames(node.id), ...node.params.flatMap(patternNames)];
  }

  switch (node.type) {
    case 'ClassExpression':
      return patternNames(node.id);
    case 'CatchClause':
      return patternNames(node.param);
    case 'BlockStatement':
    case 'StaticBlock':
      return node.body.flatMap(declaredNames);
    case 'SwitchStatement':
      return node.cases.flatMap((item: Node) => item.consequent.flatMap(declaredNames));
    case 'ForStatement':
      return declaredNames(node.init);
    case 'ForInStatement':
    case 'ForOfStatement':
      return declaredNames(node.left);
    case 'Fragment':
      return [
        ...node.nodes.flatMap((item: Node) => declaredNames(item.declaration)),
        ...(parent?.attributes ?? []).flatMap(letNames),
      ];
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

// Does this statement add a prop or method to a component? Types don't, and
// neither do re-exports from another file.
function exportsValue(statement: Node): boolean {
  if (statement.exportKind === 'type' || statement.source) return false;
  return statement.declaration || statement.specifiers.some((item: Node) => item.exportKind !== 'type');
}

// Skips past TypeScript wrappers like `{ ... } satisfies Actions`.
function withoutWrappers(value: any): any {
  while (value?.expression && value.type.startsWith('TS')) value = value.expression;
  return value;
}

// Finds what a name was set to at the top of a script, so that `export { load }`
// can be followed back to `const load = ...`.
function topLevelValue(body: Node[], name: string): Node | null {
  for (const statement of body) {
    const declaration = statement.declaration ?? statement;
    if (declaration.type === 'FunctionDeclaration' && declaration.id?.name === name) return declaration;
    if (declaration.type === 'VariableDeclaration') {
      const item = declaration.declarations.find((item: Node) => item.id.name === name);
      if (item) return item.init;
    }
  }
  return null;
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

// Finds the ) that closes the ( at `opening`, or -1 if there isn't one.
function closingBracket(css: string, opening: number): number {
  let depth = 0;
  for (let index = opening; index < css.length; index++) {
    if (css[index] === '(') depth++;
    else if (css[index] === ')' && --depth === 0) return index;
  }
  return -1;
}

// Finds `:global`, the ( ) in `:global(.a)`, and `-global-` in <style> blocks.
function marksInStyles(source: string): Mark[] {
  const marks: Mark[] = [];
  for (const block of source.matchAll(STYLE_BLOCK)) {
    const css = block[0].replace(CSS_NON_CODE, blankOut);
    for (const match of css.matchAll(CSS_SYNTAX)) {
      const start = block.index + match.index;
      marks.push({ start, end: start + match[0].length });

      const opening = match.index + match[0].length;
      const closing = css[opening] === '(' ? closingBracket(css, opening) : -1;
      if (closing >= 0) {
        marks.push({ start: block.index + opening, end: block.index + opening + 1 });
        marks.push({ start: block.index + closing, end: block.index + closing + 1 });
      }
    }
  }
  return marks;
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

  // Names that belong to Svelte or SvelteKit, like an imported `redirect` or
  // `goto`, or `children` and `data` from $props().
  const ownNames = new Set<string>();

  // Where the walk is. `await` is only Svelte syntax directly in the markup.
  let inMarkup = false;
  let functionDepth = 0;

  function add(start: number, end: number) {
    if (start >= 0 && start < end) marks.push({ start, end });
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

    if (node.type === 'EachBlock' && node.context) markEachNames(node);
    if (node.type === 'SnippetBlock') markSnippetSignature(node);

    // `then value` and `{:catch error}` create names, which plain JS has no way to
    // write. A mark that starts at the spaces joins up with the keyword before it.
    if (node.type === 'AwaitBlock') {
      for (const name of [node.value, node.error]) {
        if (name) add(afterPreviousWord(name.start), name.end);
      }
    }

    // The ( ) in {@render row(item)} can't be left out, so they're part of the tag.
    if (node.type === 'RenderTag') markCallBrackets(node.expression.expression ?? node.expression);
  }

  // Steps back over any spaces before a position.
  function afterPreviousWord(position: number): number {
    while (/\s/.test(text[position - 1] ?? '')) position--;
    return position;
  }

  // `as goal (goal.id)` names each item and says how to track it. Plain JS would
  // read `goal (goal.id)` as a function call, so the whole stretch is marked.
  function markEachNames(node: Node) {
    const tagEnd = text.indexOf('}', (node.key ?? node.context).end);
    const firstChildStart = node.body.nodes[0]?.start ?? endOf(node);
    if (tagEnd >= 0 && tagEnd < firstChildStart) add(afterPreviousWord(node.context.start), tagEnd);
  }

  // Marks the ( ) of a call. They come after the name and any <Type>.
  function markCallBrackets(call: Node) {
    const closing = endOf(call) - 1;
    if (!call.callee || text[closing] !== ')') return;
    const opening = text.indexOf('(', (call.typeArguments ?? call.callee).end);
    add(opening, opening + 1);
    add(closing, closing + 1);
  }

  // `row(item)` reads as a call in plain JS, but here it declares a snippet. Only
  // TypeScript stays unmarked. This works back from the end of the opening tag, so
  // that brackets in a type like `run: () => void` aren't taken for the real ones.
  function markSnippetSignature(node: Node) {
    const closing = text.lastIndexOf(')', (node.body.nodes[0]?.start ?? endOf(node)) - 1);
    if (closing < node.start) return;
    add(afterPreviousWord(node.expression.start), node.expression.end);

    let position = text.lastIndexOf('(', node.parameters[0]?.start ?? closing);
    for (const parameter of node.parameters) {
      add(position, parameter.typeAnnotation?.start ?? parameter.end);
      position = parameter.end;
    }
    add(position, closing + 1);
  }

  // Marks the two braces in {expression}. The JS between them stays unmarked.
  // Shorthand attributes like {name} have no braces here: see markAttribute.
  function markBraces(node: Node) {
    const end = endOf(node);
    if (text[node.start] !== '{' || text[end - 1] !== '}') return;
    add(node.start, node.start + 1);
    add(end - 1, end);
  }

  // Marks "{..." and "}" in {...rest}.
  function markSpread(node: Node) {
    add(node.start, node.expression.start);
    add(endOf(node) - 1, endOf(node));
  }

  // "bind:value={name}" gets a mark on "bind:value" and on the two braces.
  function markDirective(node: Node) {
    const name = text.slice(node.start, endOf(node)).match(/^[a-z]+:[^\s=>/]+/);
    if (!name) return;
    const nameEnd = node.start + name[0].length;
    add(node.start, nameEnd);

    // The parser gives these braces no node of their own. In shorthand like
    // `class:active`, the expression sits inside the name, so there are none.
    if (node.expression && node.expression.start >= nameEnd) {
      add(text.indexOf('{', nameEnd), text.indexOf('{', nameEnd) + 1);
      const closing = text.lastIndexOf('}', endOf(node) - 1);
      add(closing, closing + 1);
    }
  }

  function markAttribute(node: Node, parent?: Node) {
    const isSpecial =
      node.name.startsWith('data-sveltekit-') ||
      (node.name.startsWith('--') && COMPONENT_NODES.has(parent?.type ?? '')) ||
      (parent?.type === 'Script' && SCRIPT_ATTRIBUTES.has(node.name));
    if (isSpecial) add(node.start, node.start + node.name.length);

    // Shorthand: {name} is both the attribute and its value.
    if (text[node.start] === '{') {
      add(node.start, node.start + 1);
      add(endOf(node) - 1, endOf(node));
    }
  }

  // Marks `this` and any braces in <svelte:element this={tag}>. They aren't
  // ordinary attributes, so the parser keeps them on the element itself.
  function markThisAttribute(node: Node, value: Node) {
    const before = text.slice(node.start, value.start);
    const word = before.lastIndexOf('this');
    if (word >= 0) add(node.start + word, node.start + word + 'this'.length);
    if (/\{\s*$/.test(before)) {
      const opening = node.start + before.lastIndexOf('{');
      const closing = text.indexOf('}', value.end);
      add(opening, opening + 1);
      add(closing, closing + 1);
    }
  }

  // Marks "<svelte:head", the ">" or "/>" that ends it, and "</svelte:head>". The
  // attributes in between get marks of their own.
  function markElementTags(name: string, node: any) {
    const end = endOf(node);
    const openingNameEnd = node.start + '<'.length + name.length;
    add(node.start, openingNameEnd);

    // The tag ends at the first > after its last attribute. Starting from there
    // skips any > in a value, like `this={a > b}`.
    const parts = [...node.attributes, node.tag ?? node.expression].filter(Boolean);
    const tagEnd = text.indexOf('>', Math.max(openingNameEnd, ...parts.map((part) => endOf(part))));
    if (tagEnd >= 0 && tagEnd < end) add(text[tagEnd - 1] === '/' ? tagEnd - 1 : tagEnd, tagEnd + 1);

    const closingTag = text.lastIndexOf('</', end - 1);
    const nameStart = closingTag + '</'.length;
    const nameEnd = nameStart + name.length;
    if (closingTag > node.start && text.startsWith(name, nameStart) && text.slice(nameEnd, end).trim() === '>') {
      add(closingTag, end);
    }
  }

  // `slot` on a component's direct child fills one of its slots. Anywhere else
  // it's plain HTML, as on the child of a custom element.
  function markSlotAttributes(component: Node) {
    for (const child of component.fragment.nodes) {
      const slot = child.attributes?.find((item: Node) => item.type === 'Attribute' && item.name === 'slot');
      if (slot) add(slot.start, slot.start + 'slot'.length);
    }
  }

  // A rune is written like a function call, so `foo.$state()` and strings can't
  // match. It isn't one, though: Svelte rejects a rune without its ( ), so those
  // are marked too.
  function markRune(call: Node) {
    const callee = call.callee;
    if (RUNES.has(text.slice(callee.start, callee.end))) {
      add(callee.start, callee.end);
    } else if (callee.property?.name === 'with' && callee.object?.callee?.name === '$inspect') {
      // In `$inspect(x).with(fn)`, the walk reaches `$inspect` by itself.
      add(callee.property.start, callee.property.end);
    } else {
      return;
    }
    markCallBrackets(call);
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
    const params = withoutWrappers(value)?.params;
    if (params?.[0]?.type !== 'ObjectPattern') return;
    for (const property of params[0].properties) {
      if (property.key) add(property.key.start, property.key.end);
    }
  }

  function markSpecialExport(id: Node | null, value: any) {
    if (!id || !options.exportNames.includes(id.name)) return;
    add(id.start, id.end);

    // `actions` is an object of functions, so check each one. The functions in
    // other objects, like `snapshot`, are passed your own data.
    if (id.name === 'actions') {
      for (const property of withoutWrappers(value)?.properties ?? []) markProvidedValues(property.value);
    } else {
      markProvidedValues(value);
    }
  }

  // Svelte passes the content between a component's tags as `children`, and
  // SvelteKit passes a page its `data`. You can't choose those names. In
  // `{ children: content }`, `content` is your own, so only `children` gets a mark
  // and the uses of `content` stay unmarked.
  function markFixedProps(declaration: Node) {
    if (withoutWrappers(declaration.init)?.callee?.name !== '$props') return;
    for (const property of declaration.id.properties ?? []) {
      const name = property.key?.name;
      if (!options.propNames.includes(name)) continue;
      add(property.key.start, property.key.end);
      if (patternNames(property.value).includes(name)) ownNames.add(name);
    }
  }

  // In a component's main script, `$:` and `export` have their own meanings.
  function markInstanceStatement(statement: Node) {
    if (statement.type === 'LabeledStatement' && statement.label.name === '$') {
      add(statement.label.start, text.indexOf(':', statement.label.end) + 1);
    } else if (statement.type === 'ExportNamedDeclaration' && exportsValue(statement)) {
      add(statement.start, statement.start + 'export'.length);
    } else if (statement.type === 'VariableDeclaration') {
      for (const item of statement.declarations) markFixedProps(item);
    }
  }

  // `start` is where the comment's text begins, just after its `<!--` or `//`.
  function markCommentKeyword(start: number, comment: string, pattern: RegExp) {
    const keyword = comment.match(pattern);
    if (keyword) add(start + keyword.index!, start + keyword.index! + keyword[0].length);
  }

  function isStoreName(name: string): boolean {
    return options.component && name.length > 1 && name.startsWith('$') && !RUNES.has(name);
  }

  function markSpecialExports(node: Node, body: Node[]) {
    const declaration = node.declaration;
    if (declaration?.type === 'FunctionDeclaration') {
      markSpecialExport(declaration.id, declaration);
    } else if (declaration?.type === 'VariableDeclaration') {
      for (const item of declaration.declarations) markSpecialExport(item.id, item.init);
    } else if (node.exportKind !== 'type') {
      // A list, like `export { handler as GET }`. The value is declared elsewhere.
      for (const specifier of node.specifiers) {
        if (specifier.exportKind === 'type') continue;
        markSpecialExport(specifier.exported, topLevelValue(body, specifier.local.name));
      }
    }
  }

  function markNode(node: Node, hidden: Set<string>, parent?: Node, field?: string) {
    if (TAG_NODES.has(node.type)) markTagSyntax(node);
    else if (node.type.endsWith('Directive')) markDirective(node);
    else if (node.type === 'ExpressionTag') markBraces(node);
    else if (node.type === 'SpreadAttribute') markSpread(node);
    else if (node.type === 'Attribute') markAttribute(node, parent);
    else if (node.type === 'CallExpression' && options.runes) markRune(node);
    else if (node.type === 'Comment') {
      markCommentKeyword(node.start + '<!--'.length, node.data, MARKUP_COMMENT_KEYWORD);
    } else if (node.type === 'AwaitExpression') {
      if (inMarkup && functionDepth === 0) add(node.start, node.start + 'await'.length);
    } else if (node.type === 'Identifier') {
      const isMarkedName = ownNames.has(node.name) || isStoreName(node.name);
      if (isMarkedName && !hidden.has(node.name) && isUse(parent, field)) add(node.start, node.end);
    } else if (
      node.type.startsWith('Svelte') ||
      node.type === 'Component' ||
      node.type === 'SlotElement' ||
      node.name?.startsWith('enhanced:')
    ) {
      markElementTags(node.name, node);
      if (node.tag ?? node.expression) markThisAttribute(node, node.tag ?? node.expression);
      if (COMPONENT_NODES.has(node.type)) markSlotAttributes(node);
    }

    // Import, re-export and dynamic import() nodes all have a `source`.
    const importPath = node.source?.value;
    const importPart = typeof importPath === 'string' ? markedImportPart(importPath) : undefined;
    if (importPart) {
      const start = node.source.start + 1 + importPath.indexOf(importPart); // the 1 skips the quote
      add(start, start + importPart.length);
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
      const locals = localNames(value, parent);
      if (locals.length > 0) hidden = new Set([...hidden, ...locals]);
      markNode(value, hidden, parent, field);
      if (value.type === 'ImportDeclaration') return; // markImportedNames handled these
      if (value.type === 'LetDirective') return; // what's inside only creates names
    }

    const isFunction = FUNCTION_NODES.has(value.type);
    if (isFunction) functionDepth++;
    for (const [childField, child] of Object.entries(value)) {
      if (!SKIPPED_FIELDS.has(childField)) visit(child, hidden, value, childField);
    }
    if (isFunction) functionDepth--;
  }

  // Imports and exports can only sit at the top of a script, so read them first:
  // the walk below needs to know the imported names before it meets their uses.
  for (const script of [ast.module, ast.instance]) {
    const body = (script?.content.body ?? []) as any[];
    for (const statement of body) {
      if (statement.type === 'ImportDeclaration') markImportedNames(statement);
      if (statement.type === 'ExportNamedDeclaration') markSpecialExports(statement, body);
      if (options.component && script === ast.instance) markInstanceStatement(statement);
    }
  }

  // <svelte:options> is the one special element that isn't in the tree as a
  // node, and every attribute on it belongs to Svelte.
  if (ast.options) {
    markElementTags('svelte:options', ast.options);
    for (const attribute of ast.options.attributes as any[]) {
      add(attribute.start, attribute.start + attribute.name.length);
    }
    visit(ast.options.attributes, new Set());
  }

  // Comments in scripts aren't in the tree either. The parser lists them here.
  if (options.component) {
    for (const comment of (ast.comments ?? []) as any[]) {
      markCommentKeyword(comment.start + '//'.length, comment.value, SCRIPT_COMMENT_KEYWORD);
    }
  }

  // Style blocks are blanked out before parsing, so a real one isn't inside any
  // node. One in a comment, an element or a JS string is, and has no meaning.
  const topLevelNodes = [ast.module, ast.instance, ...ast.fragment.nodes] as any[];
  for (const { start, end } of options.styleMarks) {
    const isInside = (node: Node) => node.start <= start && end <= endOf(node);
    if (!topLevelNodes.some((node) => node && node.type !== 'Text' && isInside(node))) add(start, end);
  }

  visit(ast.module, new Set());
  visit(ast.instance, new Set());
  inMarkup = true;
  visit(ast.fragment, new Set());

  return withoutOverlaps(marks).map((mark) => ({
    start: mark.start - options.offset,
    end: mark.end - options.offset,
  }));
}

function findComponentMarks(source: string, filePath: string): MarkResult {
  const styleMarks = marksInStyles(source);
  const options = {
    offset: 0,
    component: true,
    runes: true,
    exportNames: specialExports(filePath),
    propNames: ['children', ...kitProps(filePath)],
    styleMarks,
  };

  // The parser can't read SCSS, so it never sees the style blocks.
  const text = source.replace(STYLE_BLOCK, blankOut);

  // The normal case: the whole file parses.
  const wholeFile = marksIn(text, options);
  if (wholeFile) return { marks: wholeFile, complete: true };

  // Something is broken. Try each part alone, so an error in one doesn't lose
  // the marks in the other.
  const markup = marksIn(text.replace(SCRIPT_BLOCK, blankOut), options);
  const scripts = marksIn(keepOnlyScripts(text), { ...options, styleMarks: [] });
  return { marks: [...(markup ?? styleMarks), ...(scripts ?? [])], complete: false };
}

function findModuleMarks(source: string, filePath: string): MarkResult {
  const marks = marksIn(SCRIPT_OPENING + source + SCRIPT_CLOSING, {
    offset: SCRIPT_OPENING.length,
    component: false,
    runes: allowsRunes(filePath),
    exportNames: specialExports(filePath),
    propNames: [],
    styleMarks: [],
  });
  return { marks: marks ?? [], complete: marks !== null };
}

function findTemplateMarks(source: string): MarkResult {
  const marks = [...source.matchAll(KIT_TEMPLATE_SYNTAX)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  return { marks, complete: true };
}

export function findMarks(source: string, filePath = 'Component.svelte'): MarkResult {
  if (filePath.endsWith('.svelte')) return findComponentMarks(source, filePath);
  if (isKitTemplate(filePath)) return findTemplateMarks(source);
  return findModuleMarks(source, filePath);
}
