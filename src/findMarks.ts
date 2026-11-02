// Finds every Svelte-specific piece of a file.
//
// This file knows nothing about VS Code: text goes in, positions come out.
// That keeps it easy to test (see test/findMarks.test.ts).
//
// The real work is done by Svelte's own parser, which turns a file into a tree
// of "nodes": one for each element, directive, block, function call and so on.
// We walk that tree and note where the Svelte-specific nodes are.

import { parse } from 'svelte/compiler';
import { fn, MODULE_SHAPES, OWN_DIRECTIVES, type Shape, type ShapeRef, SHAPES } from './shapes.ts';
import {
  allowsRunes,
  APP_TYPES,
  importsOwnNames,
  isKitTemplate,
  isSvelteConfig,
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
  exports: Record<string, ShapeRef | null>; // exports that mean something special in this file
  props: Shape; // what $props() holds in this file
  configFile: boolean; // whether this is svelte.config.js
  styleMarks: Mark[]; // what the patterns found in <style> blocks
  inKitProject: boolean; // whether SvelteKit's global `App` types exist here
}

// A name that holds something of Svelte's. `marked` says whether its uses get a
// mark: `params` from `load({ params })` keeps Svelte's spelling, but `link`
// from `load({ url: link })` is yours.
interface Binding {
  shape: Shape | null;
  marked: boolean;
}

// The names in reach at one point in the code. Null stands for a name of yours,
// which hides any Svelte name spelled the same.
type Scope = Map<string, Binding | null>;

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

// Array methods that pass each item to a function.
const ARRAY_CALLBACKS = new Set(['every', 'filter', 'find', 'findLast', 'flatMap', 'forEach', 'map', 'some']);

// Function nodes. An `await` inside one is plain JS, even in the markup.
const FUNCTION_NODES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

// The nodes that take `slot` children and CSS variables.
const COMPONENT_NODES = new Set(['Component', 'SvelteComponent', 'SvelteSelf']);

// The words that turn an ordinary comment into an instruction for Svelte.
// svelte-ignore only counts at the very start of a comment. @component only counts
// in the markup, but anywhere in the comment: that's how the Svelte tools read it.
const MARKUP_COMMENT_KEYWORD = /(?<=^\s*)svelte-ignore(?=\s)|@component\b/;
const SCRIPT_COMMENT_KEYWORD = /(?<=^\s*)svelte-ignore(?=\s)/;

// A JSDoc type like {import('./$types').PageLoad}, the JS way to write a TS one.
const JSDOC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)(?:\.([\w$]+))?/g;

// CSS is read with patterns rather than the parser, which can't read SCSS.
const CSS_SYNTAX = /:global(?![\w-])|(?<=@(?:-[a-z]+-)?keyframes\s+)-global-/g;

// The parts of CSS to ignore: comments and strings. `url(...)` is here so that
// the `//` in `url(http://a.b)` doesn't look like a comment.
const CSS_NON_CODE =
  /\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'|url\([^)]*\)|\/\/.*$/gm;

// The only Svelte syntax in SvelteKit's app.html and error.html.
const KIT_TEMPLATE_SYNTAX = /%sveltekit\.[\w.]+%|data-sveltekit-[a-z-]+/g;

// The (?=...) stops these matching custom elements like <style-guide>. Comments
// and scripts are matched too, so that a <style> written inside one isn't taken
// for a real block. Only a real block fills the capture group.
const STYLE_BLOCK =
  /<!--[\s\S]*?-->|<script(?=[\s/>])[\s\S]*?<\/script\s*>|(<style(?=[\s/>])[\s\S]*?<\/style\s*>)/g;
const SCRIPT_BLOCK = /^[ \t]*<script(?=[\s/>])[\s\S]*?<\/script\s*>/gm;

// svelte-preprocess accepts these spellings, but Svelte's parser only reads
// TypeScript when it sees lang="ts".
const LONG_TS_ATTRIBUTE =
  /(?<=<script(?=[\s/>])[^>]*)\b(?:lang=(["']?)typescript\1|type=(["'])(?:text|application)\/typescript\2)/g;

// Svelte's parser only reads components, so a .js or .ts file gets wrapped in
// this tag first, which makes it look like a component with only a script.
const SCRIPT_OPENING = '<script lang="ts">';
const SCRIPT_CLOSING = '\n</script>';

// A #! line only counts at the very start of a file, which the wrapper isn't.
const HASHBANG = /^#!.*/;

// In a JS file this text can only be in a string or a comment, but it would end
// the wrapper early.
const CLOSING_SCRIPT = /<\/script/g;

// JS comments, which Svelte allows inside a tag.
const JS_COMMENT = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;

// What ends an opening tag, unless it's in a comment.
const TAG_END = /\/\*[\s\S]*?\*\/|\/\/.*|>/g;

// Fields that hold TypeScript types, never running code.
const TYPE_FIELDS = new Set([
  'typeAnnotation',
  'typeParameters',
  'typeArguments',
  'superTypeParameters',
  'implements',
  'returnType',
]);

// TypeScript declarations that are gone when the code runs. Their parameter
// names aren't uses of anything, but the types inside them still are.
const TYPE_ONLY_NODES = new Set([
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
  'TSDeclareMethod',
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
function patternIdentifiers(pattern: any): Node[] {
  switch (pattern?.type) {
    case 'Identifier':
      return [pattern];
    case 'ObjectPattern':
    case 'ObjectExpression':
      return pattern.properties.flatMap((item: Node) => patternIdentifiers(item.value ?? item.argument));
    case 'ArrayPattern':
    case 'ArrayExpression':
      return pattern.elements.flatMap(patternIdentifiers);
    case 'AssignmentPattern':
      return patternIdentifiers(pattern.left);
    case 'RestElement':
      return patternIdentifiers(pattern.argument);
    case 'TSParameterProperty': // constructor(private a: string)
      return patternIdentifiers(pattern.parameter);
    default:
      return [];
  }
}

function patternNames(pattern: any): string[] {
  return patternIdentifiers(pattern).map((item) => item.name);
}

// Is this `import('$app/navigation')`? Imports with a variable path can't be known.
function isOwnImport(node: any): boolean {
  return node?.type === 'ImportExpression' && importsOwnNames(String(node.source?.value));
}

function declaredNames(statement: any): string[] {
  if (statement?.type === 'VariableDeclaration') {
    return statement.declarations.flatMap((item: Node) => patternNames(item.id));
  }
  const hasName = statement?.type === 'FunctionDeclaration' || statement?.type === 'ClassDeclaration';
  return hasName ? patternNames(statement.id) : [];
}

// `var` belongs to the whole function, however deep in blocks it's written. This
// stops at inner functions, whose `var`s are their own.
function hoistedVarNames(value: any): string[] {
  if (Array.isArray(value)) return value.flatMap(hoistedVarNames);
  if (typeof value?.type !== 'string' || FUNCTION_NODES.has(value.type)) return [];
  const own = value.type === 'VariableDeclaration' && value.kind === 'var' ? declaredNames(value) : [];
  return [...own, ...Object.values(value).flatMap(hoistedVarNames)];
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
    return [
      ...patternNames(node.id),
      ...node.params.flatMap(patternNames),
      ...hoistedVarNames(node.body),
      ...typeParameterNames(node),
    ];
  }

  switch (node.type) {
    case 'ClassDeclaration':
      return typeParameterNames(node);
    case 'ClassExpression':
      return [...patternNames(node.id), ...typeParameterNames(node)];
    case 'CatchClause':
      return patternNames(node.param);
    case 'BlockStatement':
    case 'StaticBlock':
    case 'TSModuleBlock':
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
        ...node.nodes.filter((item: Node) => item.type === 'SnippetBlock').flatMap(snippetName),
        ...(parent?.attributes ?? []).flatMap(letNames),
      ];
    case 'SnippetBlock':
      return node.parameters.flatMap(patternNames);
    default:
      return [];
  }
}

function snippetName(snippet: Node): string[] {
  return patternNames(snippet.expression);
}

// In `function a<Page>(b: Page)`, `Page` is that function's own, not an import.
function typeParameterNames(node: Node): string[] {
  return (node.typeParameters?.params ?? []).map((item: Node) => item.name);
}

// The names a block creates only exist in some of its parts. In
// `{#each page.items as page}`, the first `page` is still the imported one.
function namesInPart(node: Node, field: string): string[] {
  if (node.type === 'EachBlock' && (field === 'body' || field === 'key')) {
    return [...patternNames(node.context), node.index].filter(Boolean);
  }
  if (node.type === 'AwaitBlock' && field === 'then') return patternNames(node.value);
  if (node.type === 'AwaitBlock' && field === 'catch') return patternNames(node.error);
  return [];
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

// Finds the object in `{ ... }` or `wrap({ ... })`.
function objectIn(value: any): any {
  const inner = withoutWrappers(value);
  return inner?.type === 'CallExpression' ? inner.arguments.map(objectIn).find(Boolean) : inner;
}

function resolveShape(ref: ShapeRef | null | undefined): Shape | null {
  return typeof ref === 'string' ? (SHAPES[ref] ?? null) : (ref ?? null);
}

// Is this one of the names Svelte fixes on a value of this shape?
function hasMember(shape: Shape | null, name: string | undefined): boolean {
  if (!shape || name === undefined) return false;
  return Boolean(shape.anyMember) || Object.hasOwn(shape.members ?? {}, name) || Boolean(shape.older?.includes(name));
}

// What a member holds. Under a key of yours, like a field of a remote form, it
// can still be something of Svelte's.
function memberShape(shape: Shape | null, name: string): Shape | null {
  return hasMember(shape, name) ? resolveShape(shape!.members?.[name]) : resolveShape(shape?.anyKey);
}

// A whole module, as `import * as kit` or `await import()` gives it.
function moduleShape(importPath: string): Shape {
  return { anyMember: true, members: MODULE_SHAPES[importPath] };
}

// The name a key spells, in `{ a: 1 }` and `{ 'a': 1 }`.
function keyName(key: any): string | undefined {
  if (key?.type === 'Identifier') return key.name;
  return key?.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined;
}

// Adds names of yours to a scope.
function withLocals(scope: Scope, names: string[]): Scope {
  return names.length === 0 ? scope : new Map([...scope, ...names.map((name): [string, null] => [name, null])]);
}

// What a function returns. This stops at inner functions, whose returns are their own.
function returnedValues(node: Node): Node[] {
  if (node.body?.type !== 'BlockStatement') return [node.body];
  const found: Node[] = [];
  const walk = (value: any) => {
    if (Array.isArray(value)) value.forEach(walk);
    if (typeof value?.type !== 'string' || FUNCTION_NODES.has(value.type)) return;
    if (value.type === 'ReturnStatement' && value.argument) found.push(value.argument);
    for (const [field, child] of Object.entries(value)) if (field !== 'metadata') walk(child);
  };
  walk(node.body.body);
  return found;
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
    if (!block[1]) continue;
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

  // Names seen everywhere in the file that hold something of Svelte's, like an
  // imported `goto`, or `children` and `data` from $props().
  const globals = new Map<string, Binding>();

  // The statements at the top of the scripts, where `export { load }` and
  // `use:enhance={submit}` can find what those names were set to.
  const topLevel = [ast.module, ast.instance].flatMap((script: any) => script?.content.body ?? []);

  // What Svelte will pass to the functions it calls, like `load`, noted before
  // the walk reaches them.
  const paramShapes = new WeakMap<Node, (ShapeRef | null)[]>();

  // A function at the top of a script can be walked before we learn that Svelte
  // calls it, as with `use:enhance={submit}`. Then it's walked once more. Only
  // those can be, because a function inside another can see that one's names.
  const topLevelFunctions = new Set(
    topLevel
      .map((statement: Node) => statement.declaration ?? statement)
      .flatMap((statement: Node) => (statement.type === 'VariableDeclaration' ? statement.declarations : [statement]))
      .map((item: Node) => (item.type === 'VariableDeclarator' ? withoutWrappers(item.init) : item))
      .filter((item: any) => FUNCTION_NODES.has(item?.type)),
  );
  const walkedFunctions = new WeakSet<Node>();
  const walkedAgain = new WeakSet<Node>();

  // Stops `const a = b; const b = a;` from going round forever.
  const following = new Set<Node>();

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
    const gap = text.slice(start, end).replace(JS_COMMENT, blankOut);
    for (const match of gap.matchAll(TAG_SYNTAX)) {
      add(start + match.index, start + match.index + match[0].length);
    }
  }

  // Finds the > that ends an opening tag, starting after its last attribute.
  function closingAngle(position: number): number {
    TAG_END.lastIndex = position;
    for (let match = TAG_END.exec(text); match; match = TAG_END.exec(text)) {
      if (match[0] === '>') return match.index;
    }
    return -1;
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
      // Generics like <T extends { a: 1 }> are TypeScript, so a } in there isn't the tag's.
      if (child === node.expression && node.typeParams) {
        position = text.indexOf(node.typeParams, position) + node.typeParams.length;
      }
    }
    markSyntaxBetween(position, endOf(node));

    if (node.type === 'EachBlock') markEachNames(node);
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
    const tagEnd = text.indexOf('}', (node.key ?? node.context ?? node.expression).end);
    const firstChildStart = node.body.nodes[0]?.start ?? endOf(node);
    if (tagEnd < 0 || tagEnd >= firstChildStart) return;
    if (node.context) add(afterPreviousWord(node.context.start), tagEnd);
    // `{#each a, i}` names only the index.
    else if (node.index) add(text.lastIndexOf(',', tagEnd), afterPreviousWord(tagEnd));
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
      // In `a: T = 1`, the type belongs to the left part and the mark resumes after it.
      const type = (parameter.left ?? parameter).typeAnnotation;
      add(position, type ? beforeType(type.start) : parameter.end);
      if (type && parameter.left) add(type.end, parameter.end);
      position = parameter.end;
    }
    add(position, closing + 1);
  }

  // Steps back over the ? in `a?: string`, which is TypeScript too.
  function beforeType(position: number): number {
    while (/[\s?]/.test(text[position - 1] ?? '')) position--;
    return position;
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
  function markDirective(node: Node, scope: Scope) {
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

    const own = OWN_DIRECTIVES[node.type];
    if (!own) return;
    const [first, ...rest] = node.name.split('.');
    const binding = lookup(first, scope);
    if (binding) {
      // `fade` in `transition:fade={{ duration }}` takes the element, then those
      // options. An animation like `flip` takes where the element moved first.
      const target = rest.reduce((shape: Shape | null, name: string) => memberShape(shape, name), binding.shape);
      expect(node.expression, target?.args?.[node.type === 'AnimateDirective' ? 2 : 1], scope);
    } else if (binding === undefined && rest.length === 0) {
      // Your own action or transition returns an object that Svelte reads.
      const declared = withoutWrappers(topLevelValue(topLevel, first));
      if (FUNCTION_NODES.has(declared?.type)) expect(declared, own, scope);
    }
  }

  // `?/save` in a form's action names one of the page's actions. Plain HTML
  // reads it as the start of a query string.
  function markActionQuery(node: Node) {
    if (!options.inKitProject || (node.name !== 'action' && node.name !== 'formaction')) return;
    for (const part of [node.value].flat()) {
      const at = part?.type === 'Text' ? part.raw.indexOf('?/') : -1;
      if (at >= 0) add(part.start + at, part.start + at + '?/'.length);
    }
  }

  function markAttribute(node: Node, parent?: Node) {
    markActionQuery(node);
    const isSpecial =
      node.name.startsWith('data-sveltekit-') ||
      (node.name.startsWith('--') && COMPONENT_NODES.has(parent?.type ?? '')) ||
      (parent?.type === 'Script' && SCRIPT_ATTRIBUTES.has(node.name)) ||
      parent?.type === 'SvelteBoundary'; // pending, failed and onerror are all Svelte's
    // Shorthand: {name} is both the attribute and its value.
    const isShorthand = text[node.start] === '{';
    const nameStart = isShorthand ? node.start + 1 : node.start;
    if (isSpecial) add(nameStart, nameStart + node.name.length);
    if (isShorthand) {
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
    const tagEnd = closingAngle(Math.max(openingNameEnd, ...parts.map((part) => endOf(part))));
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

  function lookup(name: string, scope: Scope): Binding | null | undefined {
    return scope.has(name) ? scope.get(name) : globals.get(name);
  }

  // What a piece of code holds, if it's something of Svelte's: `event.cookies`
  // holds Cookies when `event` holds what SvelteKit passes to `load`.
  function shapeOf(value: any, scope: Scope): Shape | null {
    const inner = withoutWrappers(value);
    switch (inner?.type) {
      case 'Identifier': {
        const binding = lookup(inner.name, scope);
        // `$page` holds what the store `page` holds.
        if (binding === undefined && isStoreName(inner.name)) {
          return resolveShape(lookup(inner.name.slice(1), scope)?.shape?.value);
        }
        return binding?.shape ?? null;
      }
      case 'MemberExpression':
        // `list[0]` holds one of the list's items.
        if (inner.computed) {
          return typeof inner.property.value === 'number' ? resolveShape(shapeOf(inner.object, scope)?.items) : null;
        }
        return memberShape(shapeOf(inner.object, scope), inner.property.name);
      case 'ChainExpression':
        return shapeOf(inner.expression, scope);
      case 'AwaitExpression':
        return isOwnImport(inner.argument) ? moduleShape(inner.argument.source.value) : shapeOf(inner.argument, scope);
      case 'CallExpression':
      case 'NewExpression':
        if (options.component && inner.callee.type === 'Identifier' && inner.callee.name === '$props') {
          return options.props;
        }
        return resolveShape(shapeOf(inner.callee, scope)?.returns);
      default:
        return null;
    }
  }

  // Notes the names a pattern takes from something of Svelte's. In
  // `{ params, url: link }` taken from a load event, both keys get a mark. So
  // does every use of `params`, which keeps Svelte's spelling, but not of `link`.
  function bindPattern(pattern: any, shape: Shape | null): [string, Binding][] {
    if (!shape) return [];
    switch (pattern?.type) {
      case 'Identifier':
        return [[pattern.name, { shape, marked: false }]];
      case 'AssignmentPattern':
        return bindPattern(pattern.left, shape);
      case 'ArrayPattern':
        return pattern.elements.flatMap((item: Node) => bindPattern(item, resolveShape(shape.items)));
      case 'ObjectPattern':
        return pattern.properties.flatMap((property: Node): [string, Binding][] => {
          const name = property.computed ? undefined : keyName(property.key);
          const isSvelteName = hasMember(shape, name);
          if (!isSvelteName && !shape.anyKey) return [];
          if (isSvelteName) add(property.key.start, property.key.end);
          const inner = memberShape(shape, name!);
          const value = property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
          if (value.type !== 'Identifier') return bindPattern(value, inner);
          const marked = isSvelteName && value.name === name;
          return marked || inner ? [[value.name, { shape: inner, marked }]] : [];
        });
      default:
        return [];
    }
  }

  // The names a node creates that hold something of Svelte's: the parameters of a
  // function Svelte calls, and `const { params } = event` in a block or {@const}.
  function boundNames(node: Node, scope: Scope): Scope {
    const bound: Scope = new Map();
    const params = paramShapes.get(node);
    if (params) {
      node.params.forEach((param: Node, index: number) => {
        for (const [name, binding] of bindPattern(param, resolveShape(params[index]))) bound.set(name, binding);
      });
    }
    // `for (const cookie of cookies.getAll())` takes each item in turn.
    if (node.type === 'ForOfStatement' && node.left.type === 'VariableDeclaration') {
      const items = resolveShape(shapeOf(node.right, scope)?.items);
      for (const [name, binding] of bindPattern(node.left.declarations[0].id, items)) bound.set(name, binding);
    }
    const statements =
      node.type === 'BlockStatement' || node.type === 'StaticBlock'
        ? node.body
        : node.type === 'Fragment'
          ? node.nodes.map((item: Node) => item.declaration)
          : [];
    const declarations = statements.filter((item: any) => item?.type === 'VariableDeclaration');
    if (declarations.length === 0) return bound;
    const inner = new Map([...scope, ...bound]);
    for (const declarator of declarations.flatMap((item: Node) => item.declarations)) {
      for (const [name, binding] of bindPattern(declarator.id, shapeOf(declarator.init, inner))) {
        bound.set(name, binding);
        inner.set(name, binding);
      }
    }
    return bound;
  }

  // Marks the keys Svelte knows in a value you write for Svelte to read, like the
  // options in `goto(url, { replaceState: true })`, and notes what Svelte will
  // pass to any function in it.
  function expect(value: any, ref: ShapeRef | null | undefined, scope: Scope = new Map()) {
    const shape = resolveShape(ref);
    const inner = withoutWrappers(value);
    if (!shape || !inner) return;
    switch (inner.type) {
      case 'ObjectExpression':
        for (const property of inner.properties) {
          const name = property.computed ? undefined : keyName(property.key);
          if (hasMember(shape, name)) {
            add(property.key.start, property.key.end);
            expect(property.value, shape.members?.[name!], scope);
          } else if (name !== undefined) {
            expect(property.value, shape.anyKey, scope);
          }
        }
        break;
      case 'ArrayExpression':
        for (const item of inner.elements) expect(item, shape.items, scope);
        break;
      case 'ConditionalExpression':
        expect(inner.consequent, shape, scope);
        expect(inner.alternate, shape, scope);
        break;
      case 'LogicalExpression':
        expect(inner.left, shape, scope);
        expect(inner.right, shape, scope);
        break;
      case 'CallExpression':
        // `wrap(({ params }) => ...)` hands the same values on to the function inside.
        if (!shapeOf(inner.callee, scope)) for (const argument of inner.arguments) expect(argument, shape, scope);
        break;
      case 'Identifier': {
        // A name set at the top of the script, as in `export { load }`.
        const declared = lookup(inner.name, scope) === undefined ? topLevelValue(topLevel, inner.name) : null;
        if (declared && !following.has(declared)) {
          following.add(declared);
          expect(declared, shape, scope);
          following.delete(declared);
        }
        break;
      }
      default:
        if (FUNCTION_NODES.has(inner.type)) expectFunction(inner, shape);
    }
  }

  function expectFunction(node: Node, shape: Shape) {
    if (shape.returns) for (const result of returnedValues(node)) expect(result, shape.returns);
    if (!shape.args) return;
    paramShapes.set(node, shape.args);
    if (walkedFunctions.has(node) && topLevelFunctions.has(node) && !walkedAgain.has(node)) {
      walkedAgain.add(node);
      visit(node, new Map());
    }
  }

  // Marks `redirect` in `import { redirect } from '@sveltejs/kit'`, and notes the
  // name, so its uses get marked too. In `{ redirect as go }` and `* as kit`, the
  // name after `as` is yours. Type-only imports don't run anything.
  function markImportedNames(node: Node) {
    const importPath = node.source.value;
    if (bindOwnModule(node)) return;
    if (!importsOwnNames(importPath)) return;
    for (const specifier of node.specifiers) {
      const local = specifier.local.name;
      if (specifier.type === 'ImportNamespaceSpecifier') {
        globals.set(local, { shape: moduleShape(importPath), marked: false });
        continue;
      }
      const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : keyName(specifier.imported)!;
      const exports = MODULE_SHAPES[importPath] ?? {};
      const shape = Object.hasOwn(exports, imported) ? resolveShape(exports[imported]) : null;
      globals.set(local, { shape, marked: local === imported });
      // In `{ type Snippet }`, the word `type` is TypeScript and the name isn't.
      if (specifier.type === 'ImportSpecifier') add(specifier.imported.start, specifier.imported.end);
    }
  }

  // A .remote.ts file exports SvelteKit's remote functions, and a .svelte file
  // exports a component. The names are yours, but what they hold isn't, as in
  // `getPosts().current` or Svelte 4's `new App({ target })`.
  function bindOwnModule(node: Node): boolean {
    const isRemote = options.inKitProject && /\.remote(\.[jt]s)?$/.test(node.source.value);
    const isComponent = node.source.value.endsWith('.svelte');
    if (!isRemote && !isComponent) return false;
    for (const specifier of node.specifiers) {
      const shape = isRemote ? 'RemoteExport' : specifier.type === 'ImportDefaultSpecifier' ? 'LegacyComponent' : null;
      if (shape) globals.set(specifier.local.name, { shape: resolveShape(shape), marked: false });
    }
    return true;
  }

  // `export { page } from '$app/state'` passes Svelte's name along.
  function markReexportedNames(node: Node) {
    if (!importsOwnNames(String(node.source?.value))) return;
    for (const specifier of node.specifiers) {
      if (keyName(specifier.local) !== 'default') add(specifier.local.start, specifier.local.end);
    }
  }

  // `let { data } = $props()` and `const nav = navigating` at the top of a script
  // can be seen everywhere in the file, the markup included.
  function bindTopLevel(statement: Node) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') return;
    for (const declarator of declaration.declarations) {
      for (const [name, binding] of bindPattern(declarator.id, shapeOf(declarator.init, new Map()))) {
        globals.set(name, binding);
      }
    }
  }

  function markSpecialExport(id: Node | null, value: any) {
    if (!id || !Object.hasOwn(options.exports, id.name)) return;
    add(id.start, id.start + id.name.length); // id.end would include `: PageLoad`
    expect(value, options.exports[id.name]);
  }

  // Calls with Svelte's meaning that aren't runes, like `goto(url, { replaceState })`.
  function markCall(call: Node, scope: Scope) {
    // `cookies.getAll().map((cookie) => ...)` passes each item to the function.
    const method = call.callee.type === 'MemberExpression' && !call.callee.computed ? call.callee.property.name : '';
    if (ARRAY_CALLBACKS.has(method)) {
      const items = shapeOf(call.callee.object, scope)?.items;
      if (items) expect(call.arguments[0], fn([items]), scope);
    }
    if (options.runes && call.type === 'CallExpression') markRune(call);
    // import('svelte/store').then(({ get }) => ...)
    if (call.callee.property?.name === 'then' && isOwnImport(call.callee.object)) {
      expect(call.arguments[0], fn([moduleShape(call.callee.object.source.value)]), scope);
    }
    shapeOf(call.callee, scope)?.args?.forEach((ref, index) => expect(call.arguments[index], ref, scope));
  }

  // Marks `$app` in the text `$app/forms`, which starts at `start`.
  function markImportPath(start: number, importPath: string) {
    const part = markedImportPart(importPath);
    if (part) add(start + importPath.indexOf(part), start + importPath.indexOf(part) + part.length);
  }

  // Reads the file, not `comment.value`: Svelte takes the indentation out of that,
  // so its positions drift on every line.
  function markJsDocImports(comment: Node) {
    for (const match of text.slice(comment.start, comment.end).matchAll(JSDOC_IMPORT)) {
      const matchStart = comment.start + match.index;
      markImportPath(matchStart + match[0].indexOf(match[1]), match[1]);
      if (match[2] && importsOwnNames(match[1])) {
        const nameStart = matchStart + match[0].lastIndexOf(match[2]);
        add(nameStart, nameStart + match[2].length);
      }
    }
  }

  // `App` needs no import, so it's found by its shape: `App.Locals` in a type.
  function isKitGlobal(first: Node, name: Node): boolean {
    return options.inKitProject && first !== name && first.name === 'App';
  }

  // $$Props and friends. Unlike a store, a plain `$Type` can be your own name.
  function isDollarType(name: string): boolean {
    return options.component && name.startsWith('$$');
  }

  // Marks a name used in a type, like `Snippet`, or `Handle` in `kit.Handle`.
  function markTypeName(name: Node, scope: Scope, isValue = false) {
    let first = name;
    while (first.type === 'TSQualifiedName') first = first.left;
    if (first.type !== 'Identifier') return;
    const binding = lookup(first.name, scope);
    if (binding === null) return; // one of your names hides it
    const isStore = isValue && binding === undefined && isStoreName(first.name);
    const isGlobal = binding === undefined && (isDollarType(first.name) || isKitGlobal(first, name));
    if (binding?.marked || isStore || isGlobal) {
      add(first.start, name.end);
    } else if (binding?.shape?.anyMember && name !== first) {
      // `kit` is your name for the whole module, so the mark starts after it.
      let qualified = name;
      while (qualified.left !== first) qualified = qualified.left;
      add(qualified.right.start, name.end);
    }
  }

  // `declare global { namespace App { interface Locals {} } }`
  function markAppNamespace(node: Node) {
    add(node.id.start, node.id.end);
    for (const statement of node.body?.body ?? []) {
      const declaration = statement.declaration ?? statement;
      if (APP_TYPES.includes(declaration.id?.name)) add(declaration.id.start, declaration.id.end);
    }
  }

  // TypeScript stays unmarked, apart from the names that belong to Svelte, like
  // `Snippet`, `PageLoad` and `$$Props`.
  function visitType(value: any, scope: Scope) {
    if (Array.isArray(value)) {
      for (const item of value) visitType(item, scope);
      return;
    }
    if (value === null || typeof value !== 'object') return;

    if (value.type === 'TSTypeReference') markTypeName(value.typeName, scope);
    else if (value.type === 'TSExpressionWithTypeArguments') markTypeName(value.expression, scope);
    else if (value.type === 'TSTypeQuery') markTypeName(value.exprName, scope, true);
    else if (value.type === 'TSImportType') {
      const importPath = value.argument?.value;
      if (typeof importPath === 'string') {
        markImportPath(value.argument.start + 1, importPath);
        if (value.qualifier && importsOwnNames(importPath)) add(value.qualifier.start, value.qualifier.end);
      }
    } else if (value.type === 'TSTypeAliasDeclaration' || value.type === 'TSInterfaceDeclaration') {
      if (isDollarType(value.id.name)) add(value.id.start, value.id.end); // type $$Props = ...
    }

    const generics = value.typeParameters?.type === 'TSTypeParameterDeclaration';
    const inner = generics ? withLocals(scope, typeParameterNames(value)) : scope;
    for (const child of Object.values(value)) visitType(child, inner);
  }

  // `export let data` in a legacy page. As with $props(), SvelteKit fixes the name.
  function markLegacyProps(declaration: any) {
    if (declaration?.type !== 'VariableDeclaration') return;
    for (const { id } of declaration.declarations) {
      if (id.type !== 'Identifier' || id.name === 'children' || !hasMember(options.props, id.name)) continue;
      add(id.start, id.start + id.name.length);
      globals.set(id.name, { shape: memberShape(options.props, id.name), marked: true });
    }
  }

  // In a component's main script, `$:` and `export` have their own meanings.
  function markInstanceStatement(statement: Node) {
    if (statement.type === 'LabeledStatement' && statement.label.name === '$') {
      add(statement.label.start, text.indexOf(':', statement.label.end) + 1);
    } else if (statement.type === 'ExportNamedDeclaration' && exportsValue(statement)) {
      add(statement.start, statement.start + 'export'.length);
      markLegacyProps(statement.declaration);
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
      for (const item of declaration.declarations) {
        if (item.id.type === 'Identifier') markSpecialExport(item.id, item.init);
        // `export const { handle } = auth()` has no function to look inside.
        else for (const id of patternIdentifiers(item.id)) markSpecialExport(id, null);
      }
    } else if (node.exportKind !== 'type') {
      // A list, like `export { handler as GET }`. The value is declared elsewhere.
      for (const specifier of node.specifiers) {
        if (specifier.exportKind === 'type') continue;
        markSpecialExport(specifier.exported, topLevelValue(body, specifier.local.name));
      }
    }
  }

  function markNode(node: Node, scope: Scope, parent?: Node, field?: string) {
    if (TAG_NODES.has(node.type)) markTagSyntax(node);
    else if (node.type.endsWith('Directive')) markDirective(node, scope);
    else if (node.type === 'ExpressionTag') markBraces(node);
    else if (node.type === 'SpreadAttribute') markSpread(node);
    else if (node.type === 'Attribute') markAttribute(node, parent);
    else if (node.type === 'CallExpression' || node.type === 'NewExpression') markCall(node, scope);
    else if (node.type === 'TSModuleDeclaration' && node.id.name === 'App' && options.inKitProject) {
      markAppNamespace(node);
    } else if (node.type === 'Comment') {
      markCommentKeyword(node.start + '<!--'.length, node.data, MARKUP_COMMENT_KEYWORD);
    } else if (node.type === 'AwaitExpression') {
      if (inMarkup && functionDepth === 0) add(node.start, node.start + 'await'.length);
    } else if (node.type === 'Identifier') {
      const binding = lookup(node.name, scope);
      const isStore = binding === undefined && isStoreName(node.name);
      if ((binding?.marked || isStore) && isUse(parent, field)) add(node.start, node.end);
      // `locals` in `event.locals`, and `error` in `kit.error()`.
      const isMember = parent?.type === 'MemberExpression' && field === 'property' && !parent.computed;
      if (isMember && hasMember(shapeOf(parent.object, scope), node.name)) add(node.start, node.end);
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
    if (typeof importPath === 'string') markImportPath(node.source.start + 1, importPath); // 1 skips the quote
  }

  // Goes through the whole tree, marking every node it meets. `scope` holds the
  // names in reach at this point in the code.
  function visit(value: any, scope: Scope, parent?: Node, field?: string) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, scope, parent, field);
      return;
    }
    if (value === null || typeof value !== 'object') return;

    if (typeof value.type === 'string') {
      if (TYPE_ONLY_NODES.has(value.type)) {
        visitType(value, scope);
        return;
      }
      scope = withLocals(scope, localNames(value, parent));
      const bound = boundNames(value, scope);
      if (bound.size > 0) scope = new Map([...scope, ...bound]);
      markNode(value, scope, parent, field);
      if (value.type === 'ImportDeclaration') return; // markImportedNames handled these
      if (value.type === 'LetDirective') return; // what's inside only creates names
    }

    const isFunction = FUNCTION_NODES.has(value.type);
    if (isFunction) {
      functionDepth++;
      walkedFunctions.add(value);
    }
    for (const [childField, child] of Object.entries(value)) {
      if (childField === 'metadata') continue; // parser bookkeeping
      if (TYPE_FIELDS.has(childField)) {
        visitType(child, scope);
        continue;
      }
      visit(child, withLocals(scope, namesInPart(value, childField)), value, childField);
    }
    if (isFunction) functionDepth--;
  }

  // Imports can only sit at the top of a script and count in the whole file, so
  // they're read first. The walk below needs to know the names at the top before
  // it meets their uses.
  for (const statement of topLevel) {
    if (statement.type === 'ImportDeclaration') markImportedNames(statement);
  }
  for (const script of [ast.module, ast.instance]) {
    const body = (script?.content.body ?? []) as any[];
    for (const statement of body) {
      bindTopLevel(statement);
      if (statement.type === 'ExportNamedDeclaration') {
        markSpecialExports(statement, body);
        markReexportedNames(statement);
      }
      if (statement.type === 'ExportDefaultDeclaration' && options.configFile) {
        expect(statement.declaration, 'LegacySvelteConfig');
      }
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
    visit(ast.options.attributes, new Map());
  }

  // Comments in scripts aren't in the tree either. The parser lists them here.
  // Svelte obeys svelte-ignore in components and modules with runes, not in plain JS.
  for (const comment of (ast.comments ?? []) as any[]) {
    const start = comment.start + '//'.length;
    if (options.runes) markCommentKeyword(start, text.slice(start, comment.end), SCRIPT_COMMENT_KEYWORD);
    if (comment.type === 'Block' && comment.value.startsWith('*')) markJsDocImports(comment);
  }

  // Style blocks are blanked out before parsing, so a real one isn't inside any
  // node. One nested in an element is, and Svelte leaves that CSS as it is.
  const topLevelNodes = [ast.module, ast.instance, ...ast.fragment.nodes] as any[];
  for (const { start, end } of options.styleMarks) {
    const isInside = (node: Node) => node.start <= start && end <= endOf(node);
    if (!topLevelNodes.some((node) => node && node.type !== 'Text' && isInside(node))) add(start, end);
  }

  visit(ast.module, new Map());
  visit(ast.instance, new Map());
  inMarkup = true;
  visit(ast.fragment, new Map());

  return withoutOverlaps(marks).map((mark) => ({
    start: mark.start - options.offset,
    end: mark.end - options.offset,
  }));
}

function findComponentMarks(source: string, filePath: string, inKitProject: boolean): MarkResult {
  const styleMarks = marksInStyles(source);
  const options = {
    offset: 0,
    component: true,
    runes: true,
    exports: specialExports(filePath),
    props: { members: { children: null, ...kitProps(filePath) } },
    configFile: false,
    styleMarks,
    inKitProject,
  };

  // The parser can't read SCSS, so it never sees the style blocks. Everything here
  // swaps text for text of the same length, so the offsets stay the same.
  const text = source
    .replace(STYLE_BLOCK, (match, style) => (style ? blankOut(match) : match))
    .replace(LONG_TS_ATTRIBUTE, (match) => 'lang="ts"'.padEnd(match.length));

  // The normal case: the whole file parses.
  const wholeFile = marksIn(text, options);
  if (wholeFile) return { marks: wholeFile, complete: true };

  // Something is broken. Try each part alone, so an error in one doesn't lose
  // the marks in the other.
  const markup = marksIn(text.replace(SCRIPT_BLOCK, blankOut), options);
  const scripts = marksIn(keepOnlyScripts(text), { ...options, styleMarks: [] });
  return { marks: [...(markup ?? styleMarks), ...(scripts ?? [])], complete: false };
}

function findModuleMarks(source: string, filePath: string, inKitProject: boolean): MarkResult {
  const body = source.replace(HASHBANG, blankOut).replace(CLOSING_SCRIPT, '<_script');
  const marks = marksIn(SCRIPT_OPENING + body + SCRIPT_CLOSING, {
    offset: SCRIPT_OPENING.length,
    component: false,
    runes: allowsRunes(filePath),
    exports: specialExports(filePath, inKitProject),
    props: {},
    configFile: isSvelteConfig(filePath),
    styleMarks: [],
    inKitProject,
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

export function findMarks(source: string, filePath = 'Component.svelte', inKitProject = true): MarkResult {
  if (filePath.endsWith('.svelte')) return findComponentMarks(source, filePath, inKitProject);
  if (isKitTemplate(filePath)) return findTemplateMarks(source);
  return findModuleMarks(source, filePath, inKitProject);
}
