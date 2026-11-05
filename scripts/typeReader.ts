// Reads the types that Svelte, SvelteKit and the official adapters publish, for
// test/svelteNames.test.ts and scripts/generateShapes.ts. TypeScript 7, which
// checks this project, has no API for reading types yet, so this uses TypeScript 6.

import { fileURLToPath } from 'node:url';
import ts from 'typescript-6';

export { ts };

// The types src/shapes.ts copies by hand, and the extra types the generator
// starts from. Between them they import every package read here.
export const HAND_TYPES_FILE = fileURLToPath(new URL('../test/svelteTypes.ts', import.meta.url));
export const ROOT_TYPES_FILE = fileURLToPath(new URL('shapeRoots.ts', import.meta.url));

export const program = ts.createProgram([HAND_TYPES_FILE, ROOT_TYPES_FILE], {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  types: [],
});
export const checker = program.getTypeChecker();

export function typeErrors(): string[] {
  return [HAND_TYPES_FILE, ROOT_TYPES_FILE].flatMap((file) =>
    ts
      .getPreEmitDiagnostics(program, program.getSourceFile(file))
      .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
  );
}

// `prototype` and the methods every object has are plain JS. `#private`, names
// with `$$` or a leading `__`, and symbol keys are bookkeeping that no one writes.
const PLAIN_JS_NAMES = new Set(['prototype', 'constructor', 'toString', 'valueOf']);

export function isWrittenName(name: string): boolean {
  return !PLAIN_JS_NAMES.has(name) && !name.startsWith('#') && !name.includes('$$') && !name.startsWith('__');
}

function isSvelteFile(fileName: string): boolean {
  return /node_modules\/(svelte|@sveltejs)\//.test(fileName);
}

// The members of a type that Svelte's own type files declare. A member those
// files only repeat, like `searchParams` on a URL, still counts here, which is
// what LEFT_OUT is for.
export function svelteMembers(type: ts.Type): ts.Symbol[] {
  return checker
    .getPropertiesOfType(type)
    .filter((item) => isWrittenName(item.name))
    .filter((item) => item.declarations?.some((declaration) => isSvelteFile(declaration.getSourceFile().fileName)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The type aliases a file exports, by name.
export function exportedTypes(file: string): Map<string, ts.Type> {
  const types = new Map<string, ts.Type>();
  for (const statement of program.getSourceFile(file)!.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue;
    if (!statement.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)) continue;
    types.set(statement.name.text, checker.getTypeAtLocation(statement.name));
  }
  return types;
}

// The modules of Svelte, SvelteKit and the adapters, by import path.
export function svelteModules(): Map<string, ts.Symbol> {
  const modules = new Map<string, ts.Symbol>();
  for (const module of checker.getAmbientModules()) {
    const name = module.getName().replace(/^"|"$/g, '');
    if (/^(svelte|\$app|@sveltejs)/.test(name)) modules.set(name, module);
  }
  for (const file of [HAND_TYPES_FILE, ROOT_TYPES_FILE]) {
    for (const statement of program.getSourceFile(file)!.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const module = checker.getSymbolAtLocation(statement.moduleSpecifier);
      if (module) modules.set(statement.moduleSpecifier.text, module);
    }
  }
  return new Map([...modules].sort(([a], [b]) => a.localeCompare(b)));
}

// The exported values and types of a module.
export function moduleExports(module: ts.Symbol): { name: string; symbol: ts.Symbol }[] {
  return checker.getExportsOfModule(module).map((item) => ({
    name: item.name,
    symbol: item.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item,
  }));
}

// What a value of this type can be: a promise counts as what it holds, and a
// union as each of its kinds. A promise with names of its own, like what a remote
// query returns, counts as itself too. TypeScript orders a union by when it first
// met each kind, which changes with what was read before, so they're sorted by name.
export function kindsOf(type: ts.Type): ts.Type[] {
  const awaited = checker.getAwaitedType(type);
  if (awaited && awaited !== type) {
    return [...(svelteMembers(type).length > 0 ? [type] : []), ...kindsOf(awaited)];
  }
  if (!type.isUnion()) return [type];
  const describe = (kind: ts.Type) => checker.typeToString(kind, undefined, ts.TypeFormatFlags.NoTruncation);
  return [...type.types].sort((a, b) => describe(a).localeCompare(describe(b))).flatMap(kindsOf);
}

// The strings the values of these types can only be, like 'hover' and 'tap'.
// Where any string will do, as for an attribute's `name`, none are fixed.
export function fixedValues(types: readonly ts.Type[]): string[] {
  const kinds = types.flatMap(kindsOf);
  const anyString = ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping;
  if (kinds.some((kind) => kind.flags & anyString)) return [];
  const strings = kinds.filter((kind) => kind.isStringLiteral());
  return [...new Set(strings.map((kind) => (kind as ts.StringLiteralType).value))].sort();
}

export function isArray(type: ts.Type): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type);
}

export function itemTypes(type: ts.Type): readonly ts.Type[] {
  return checker.getTypeArguments(type as ts.TypeReference);
}

// A type with members or call signatures. A generic one, like what a remote query
// returns, can have them without TypeScript calling it an object.
export function isObject(type: ts.Type): boolean {
  if (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) return true;
  const plain = ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;
  if (type.flags & (ts.TypeFlags.TypeParameter | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | plain)) return false;
  return checker.getPropertiesOfType(type).length > 0 || signaturesOf(type).length > 0;
}

export function signaturesOf(type: ts.Type): readonly ts.Signature[] {
  return [...type.getCallSignatures(), ...type.getConstructSignatures()];
}

// Where in Svelte's types a name is left unmarked, and why. A position reads like
// `$app/state:page.url`, or `svelte/store:get(0)` for the first argument of
// get(), or `svelte/transition:fade=>` for what fade() returns.
export const LEFT_OUT: [RegExp, string][] = [
  // Names that plain JS, the web platform or the host fixes, which Svelte's types repeat.
  [/\.url$/, 'page.url is an ordinary URL'],
  [/^svelte\/reactivity:Svelte(Map|Set|URL)=>$/, 'the methods of a Map, a Set or a URL'],
  [/^svelte\/events:on\(2\)\(0\)$/, 'a DOM event'],
  [/^svelte\/transition:draw\(0\)$/, 'an SVG element'],
  [/\.platform$/, "the host platform's names, like Cloudflare's env"],
  [/\.(directives|reportOnly)$/, 'CSP directives, named by the web standard'],
  [/^@sveltejs\/adapter-vercel:default\(0\)\.images/, "Vercel's image options"],
  [/\.methods?$/, 'HTTP methods, like POST'],
  [/\.aria-[a-z]+$/, 'ARIA attributes, named by the web standard'],
  [/\.comments\[\]\.type$/, 'the kinds of JS comment, which ESTree names'],
  // Values Svelte gave you that you pass back, rather than write.
  [/^svelte\/store:(get|readonly|fromStore)\(0\)$/, 'a store you pass in'],
  [/^svelte:(mount|hydrate)\(0\)/, 'the component you pass in'],
  [/\.resolve\(0\)/, 'the request event you pass back'],
  [/^\$app\/forms:applyAction\(0\)/, 'the action result you pass back'],
  // Could be any thrown error, so its `message` can be plain JS.
  [/\(0\)\.error$|\.result\.error$|=>\.error$/, 'any thrown error'],
  [/^svelte:createRawSnippet=>=>$/, 'a marker that only TypeScript sees'],
  // findMarks.ts follows `export const handle = sequence(...)` like any wrapper.
  [/^@sveltejs\/kit\/hooks:sequence/, 'followed as a wrapper'],
];

export function isLeftOut(position: string): boolean {
  return LEFT_OUT.some(([pattern]) => pattern.test(position));
}
