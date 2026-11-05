// Checks the shapes in src/shapes.ts and src/generatedShapes.ts against the types
// that Svelte, SvelteKit and the official adapters publish. An update that adds,
// renames or removes a name makes this fail: add the new name to the shape, or
// move a removed one to the shape's `older` list, and run `npm run shapes`. The
// same goes for the strings a value can be, which a shape lists in `values`. A new
// export with names of its own fails it too, until it has a shape or a line in
// LEFT_OUT, in scripts/typeReader.ts, that says why it has none.
//   npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { generateShapes, OUTPUT_FILE } from '../scripts/generateShapes.ts';
import {
  checker,
  exportedTypes,
  fixedValues,
  HAND_TYPES_FILE,
  isArray,
  isLeftOut,
  isObject,
  isWrittenName,
  itemTypes,
  kindsOf,
  moduleExports,
  signaturesOf,
  svelteMembers,
  svelteModules,
  ts,
  typeErrors,
} from '../scripts/typeReader.ts';
import {
  HAND_SHAPES,
  MODULE_SHAPES,
  OWN_DIRECTIVES,
  type Shape,
  type ShapeRef,
  SHAPES,
  SVELTE_OPTIONS,
} from '../src/shapes.ts';
import { kitProps, LINK_OPTIONS, PRERENDER, specialExports, TRAILING_SLASH, TRANSITION_EVENT } from '../src/svelteNames.ts';

test('the type files have no type errors', () => {
  assert.deepEqual(typeErrors(), []);
});

// The member names of each type in test/svelteTypes.ts. A union like Navigation
// has every name that any of its kinds has.
const handTypes = new Map(
  [...exportedTypes(HAND_TYPES_FILE)].map(([name, type]) => {
    const parts = type.isUnion() ? type.types : [type];
    const names = parts.flatMap((part) => checker.getPropertiesOfType(part).map((item) => item.name));
    return [name, new Set(names.filter(isWrittenName))];
  }),
);

function resolveShape(ref: ShapeRef | null | undefined): Shape | null {
  return typeof ref === 'string' ? (SHAPES[ref] ?? null) : (ref ?? null);
}

function hasMember(shape: Shape | null, name: string): boolean {
  if (!shape) return false;
  return Boolean(shape.anyMember) || Object.hasOwn(shape.members ?? {}, name) || Boolean(shape.older?.includes(name));
}

// Every shape that a shape, a module or a SvelteKit file points at by name.
function namedShapes(ref: ShapeRef | null | undefined): string[] {
  if (typeof ref === 'string') return [ref];
  if (!ref) return [];
  return [
    ...Object.values(ref.members ?? {}),
    ...(ref.args ?? []),
    ref.anyKey,
    ref.returns,
    ref.items,
    ref.value,
  ].flatMap(namedShapes);
}

test('every shape written by hand has a type to check it against', () => {
  assert.deepEqual(Object.keys(HAND_SHAPES).sort(), [...handTypes.keys()].sort());
});

test('each shape written by hand lists the same names as its type', () => {
  for (const [name, members] of handTypes) {
    assert.deepEqual(new Set(Object.keys(HAND_SHAPES[name]?.members ?? {})), members, name);
  }
});

test('names from older versions are gone from the types', () => {
  for (const [name, shape] of Object.entries(HAND_SHAPES)) {
    for (const older of shape.older ?? []) {
      assert.ok(!handTypes.get(name)?.has(older), `${name} has ${older} again, so it belongs in members`);
    }
  }
});

test('the generated shapes are up to date', () => {
  assert.ok(generateShapes() === readFileSync(OUTPUT_FILE, 'utf8'), 'src/generatedShapes.ts is out of date: run npm run shapes');
});

test('the generated shapes give away nothing about this machine', () => {
  assert.doesNotMatch(readFileSync(OUTPUT_FILE, 'utf8'), /\/Users\/|\/home\/|node_modules|[A-Z]:\\\\/);
});

test('every shape named anywhere exists', () => {
  const files = [
    'src/routes/+page.svelte',
    'src/routes/+page.server.ts',
    'src/routes/+page.ts',
    'src/routes/+server.ts',
    'src/hooks.server.ts',
    'src/hooks.client.ts',
    'src/routes/+error.svelte',
  ];
  const refs = [
    SVELTE_OPTIONS,
    'InspectResult',
    ...Object.values(SHAPES),
    ...Object.values(MODULE_SHAPES).flatMap((exports) => Object.values(exports)),
    ...Object.values(OWN_DIRECTIVES),
    ...files.flatMap((file) => [...Object.values(specialExports(file)), ...Object.values(kitProps(file))]),
  ];
  const missing = refs.flatMap(namedShapes).filter((name) => !Object.hasOwn(SHAPES, name));
  assert.deepEqual([...new Set(missing)], []);
});

// Walks the types at one place next to the shape that should describe them, and
// notes where they have names from Svelte's files that the shape doesn't cover, or
// strings they can be that differ from the shape's `values`. As in the generator,
// the kinds of a union count together: `type` on a form result can be 'success' on
// one kind and 'failure' on another, and the shape lists both.
function findGaps(
  types: readonly ts.Type[],
  ref: ShapeRef | null | undefined,
  position: string,
  gaps: Map<string, Set<string>>,
  seen = new Set<ts.Type>(),
  depth = 0,
) {
  // A place whose types were all met higher up is a loop, like the children of an
  // element, which are elements again. A place with some new ones still counts all
  // of them, so that its values aren't cut short.
  if (types.every((type) => seen.has(type)) || depth > 7 || isLeftOut(position)) return;
  const kinds = [...new Set(types.flatMap(kindsOf))];
  seen = new Set([...seen, ...types, ...kinds]);
  const shape = resolveShape(ref);
  const note = (items: string[]) => {
    if (items.length > 0) gaps.set(position, new Set([...(gaps.get(position) ?? []), ...items]));
  };

  const strings = fixedValues(types).join(', ');
  const listed = [...new Set(shape?.values ?? [])].sort().join(', ');
  if (strings !== listed) note([`values ${strings || 'none'}, not ${listed || 'none'}`]);

  const items = kinds.filter(isArray).flatMap(itemTypes);
  if (items.length > 0) findGaps(items, shape?.items, `${position}[]`, gaps, seen, depth + 1);

  const objects = kinds.filter((kind) => !isArray(kind) && isObject(kind));
  const members = new Map<string, ts.Type[]>();
  for (const member of objects.flatMap(svelteMembers)) {
    members.set(member.name, [...(members.get(member.name) ?? []), checker.getTypeOfSymbol(member)]);
  }
  note([...members.keys()].filter((name) => !hasMember(shape, name)));
  for (const [name, memberTypes] of members) {
    findGaps(memberTypes, shape?.members?.[name], `${position}.${name}`, gaps, seen, depth + 1);
  }

  const signatures = objects.flatMap(signaturesOf);
  const count = Math.max(0, ...signatures.map((signature) => signature.getParameters().length));
  for (let index = 0; index < count; index++) {
    const parameters = signatures.flatMap((signature) => signature.getParameters()[index] ?? []);
    const parameterTypes = parameters.map((item) => checker.getTypeOfSymbol(item));
    findGaps(parameterTypes, shape?.args?.[index], `${position}(${index})`, gaps, seen, depth + 1);
  }
  if (signatures.length > 0) {
    const returned = signatures.map((signature) => signature.getReturnType());
    findGaps(returned, shape?.returns, `${position}=>`, gaps, seen, depth + 1);
  }
}

test('every export of Svelte and SvelteKit has its names covered, or a reason in LEFT_OUT', () => {
  const gaps = new Map<string, Set<string>>();
  const typeExports = new Map<string, ts.Symbol>();
  for (const [path, module] of svelteModules()) {
    for (const { name, symbol } of moduleExports(module)) {
      if (symbol.flags & ts.SymbolFlags.Type) typeExports.set(`${path}:${name}`, symbol);
      if (symbol.flags & ts.SymbolFlags.Value) {
        findGaps([checker.getTypeOfSymbol(symbol)], MODULE_SHAPES[path]?.[name], `${path}:${name}`, gaps);
      }
    }
  }

  // The functions SvelteKit calls, checked against the types it gives them.
  const called: [string, string, string][] = [
    ['@sveltejs/kit:Load', 'src/routes/+page.ts', 'load'],
    ['@sveltejs/kit:ServerLoad', 'src/routes/+page.server.ts', 'load'],
    ['@sveltejs/kit:Actions', 'src/routes/+page.server.ts', 'actions'],
    ['@sveltejs/kit:RequestHandler', 'src/routes/+server.ts', 'GET'],
    ['@sveltejs/kit:Snapshot', 'src/routes/+page.svelte', 'snapshot'],
    ['@sveltejs/kit/hooks:Handle', 'src/hooks.server.ts', 'handle'],
    ['@sveltejs/kit/hooks:HandleFetch', 'src/hooks.server.ts', 'handleFetch'],
    ['@sveltejs/kit/hooks:HandleServerError', 'src/hooks.server.ts', 'handleError'],
    ['@sveltejs/kit/hooks:HandleClientError', 'src/hooks.client.ts', 'handleError'],
    ['@sveltejs/kit/hooks:Reroute', 'src/hooks.ts', 'reroute'],
    ['@sveltejs/kit/hooks:Transport', 'src/hooks.ts', 'transport'],
    ['@sveltejs/kit/hooks:ServerInit', 'src/hooks.server.ts', 'init'],
  ];
  for (const [typeName, file, exportName] of called) {
    const symbol = typeExports.get(typeName);
    assert.ok(symbol, `SvelteKit no longer has ${typeName}`);
    findGaps([checker.getDeclaredTypeOfSymbol(symbol)], specialExports(file)[exportName], `${file} ${exportName}`, gaps);
  }

  // The shapes written by hand that no export leads to, like what's in svelte.config.js.
  const reached = new Set<string>();
  const reach = (ref: ShapeRef | null | undefined) => {
    for (const name of namedShapes(ref)) {
      if (reached.has(name)) continue;
      reached.add(name);
      reach(SHAPES[name]);
    }
  };
  for (const exports of Object.values(MODULE_SHAPES)) Object.values(exports).forEach(reach);
  for (const [, file, exportName] of called) reach(specialExports(file)[exportName]);
  for (const [name, type] of exportedTypes(HAND_TYPES_FILE)) {
    if (!reached.has(name)) findGaps([type], HAND_SHAPES[name], name, gaps);
  }

  const uncovered = [...gaps].map(([position, names]) => `${position}: ${[...names].join(', ')}`);
  assert.deepEqual(uncovered, [], `Names or strings with no shape and no reason in LEFT_OUT:\n${uncovered.join('\n')}`);
});

// Finds a type alias by name in a file of SvelteKit's, for the ones it doesn't export.
function kitTypeAlias(path: string, name: string): ts.TypeAliasDeclaration {
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const alias = file.statements.find((item) => ts.isTypeAliasDeclaration(item) && item.name.text === name);
  assert.ok(alias, `${path} no longer has ${name}`);
  return alias as ts.TypeAliasDeclaration;
}

function literalsIn(node: ts.Node): string[] {
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return [node.literal.text];
  const found: string[] = [];
  node.forEachChild((child) => {
    found.push(...literalsIn(child));
  });
  return found;
}

test('the page options list the same strings as SvelteKit', () => {
  const kit = new URL('../node_modules/@sveltejs/kit/src/types/private.d.ts', import.meta.url);
  const path = kit.pathname;
  assert.deepEqual(PRERENDER.values, literalsIn(kitTypeAlias(path, 'PrerenderOption')).sort());
  assert.deepEqual(TRAILING_SLASH.values, literalsIn(kitTypeAlias(path, 'TrailingSlash')).sort());
});

test('the link options list the same values as SvelteKit', () => {
  const path = new URL('../node_modules/@sveltejs/kit/src/runtime/client/utils.js', import.meta.url).pathname;
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  let found: ts.ObjectLiteralExpression | undefined;
  const search = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'valid_link_options') {
      let value = node.initializer;
      while (value && ts.isParenthesizedExpression(value)) value = value.expression;
      if (value && ts.isObjectLiteralExpression(value)) found = value;
    }
    node.forEachChild(search);
  };
  search(file);
  assert.ok(found, 'SvelteKit no longer has valid_link_options');
  const kit = Object.fromEntries(
    found.properties.filter(ts.isPropertyAssignment).map((property) => {
      const name = ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(file);
      const items = (property.initializer as ts.ArrayLiteralExpression).elements.map((item) => (item as ts.StringLiteral).text);
      return [name, items.filter(Boolean).sort()];
    }),
  );
  const ours = Object.fromEntries(
    Object.entries(LINK_OPTIONS)
      .filter(([, option]) => option.values.length > 0)
      .map(([name, option]) => [name, option.values]),
  );
  assert.deepEqual(ours, kit);
  for (const [name, option] of Object.entries(LINK_OPTIONS)) {
    for (const value of option.older ?? []) assert.ok(!kit[name]?.includes(value), `${name}="${value}" is current again`);
  }
});

// Events of the web platform that TypeScript's own DOM types don't list.
const WEB_EVENTS_TYPESCRIPT_LACKS = new Set(['contentvisibilityautostatechange', 'dragexit', 'encrypted']);

test("Svelte's transition events are the only events Svelte names on an element", () => {
  const elements = svelteModules().get('svelte/elements');
  assert.ok(elements, 'test/svelteTypes.ts no longer imports svelte/elements');
  const attributes = moduleExports(elements).find((item) => item.name === 'HTMLAttributes');
  const dom = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(attributes!.symbol));
  const webEvents = new Set(
    ['HTMLElementEventMap', 'WindowEventMap', 'DocumentEventMap', 'SVGElementEventMap'].flatMap((name) => {
      const symbol = checker.resolveName(name, undefined, ts.SymbolFlags.Type, false);
      return symbol ? checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol)).map((item) => item.name) : [];
    }),
  );
  const svelteEvents = dom
    .map((item) => item.name)
    .filter((name) => /^on[a-z]+$/.test(name) && !name.endsWith('capture'))
    .filter((name) => !webEvents.has(name.slice(2)) && !WEB_EVENTS_TYPESCRIPT_LACKS.has(name.slice(2)));
  assert.deepEqual(svelteEvents.filter((name) => !TRANSITION_EVENT.test(name)), []);
  assert.deepEqual(svelteEvents.sort(), ['onintroend', 'onintrostart', 'onoutroend', 'onoutrostart']);
});
