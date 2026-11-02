// Checks the shapes in src/shapes.ts and src/generatedShapes.ts against the types
// that Svelte, SvelteKit and the official adapters publish. An update that adds,
// renames or removes a name makes this fail: add the new name to the shape, or
// move a removed one to the shape's `older` list, and run `npm run shapes`. A new
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
import { HAND_SHAPES, MODULE_SHAPES, OWN_DIRECTIVES, type Shape, type ShapeRef, SHAPES } from '../src/shapes.ts';
import { kitProps, specialExports } from '../src/svelteNames.ts';

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
    ...Object.values(SHAPES),
    ...Object.values(MODULE_SHAPES).flatMap((exports) => Object.values(exports)),
    ...Object.values(OWN_DIRECTIVES),
    ...files.flatMap((file) => [...Object.values(specialExports(file)), ...Object.values(kitProps(file))]),
  ];
  const missing = refs.flatMap(namedShapes).filter((name) => !Object.hasOwn(SHAPES, name));
  assert.deepEqual([...new Set(missing)], []);
});

// Walks a type next to the shape that should describe it, and notes each place
// where the type has names from Svelte's files that the shape doesn't cover.
function findGaps(
  type: ts.Type,
  ref: ShapeRef | null | undefined,
  position: string,
  gaps: Map<string, Set<string>>,
  seen = new Set<ts.Type>(),
) {
  if (seen.has(type) || seen.size > 7 || isLeftOut(position)) return;
  seen = new Set(seen).add(type);
  const shape = resolveShape(ref);
  for (const kind of kindsOf(type)) {
    if (kind !== type && seen.has(kind)) continue;
    if (isArray(kind)) {
      for (const item of itemTypes(kind)) findGaps(item, shape?.items, `${position}[]`, gaps, seen);
      continue;
    }
    if (!isObject(kind)) continue;
    const members = svelteMembers(kind);
    const missing = members.filter((item) => !hasMember(shape, item.name)).map((item) => item.name);
    if (missing.length > 0) gaps.set(position, new Set([...(gaps.get(position) ?? []), ...missing]));
    for (const member of members) {
      findGaps(checker.getTypeOfSymbol(member), shape?.members?.[member.name], `${position}.${member.name}`, gaps, seen);
    }
    for (const signature of signaturesOf(kind)) {
      signature.getParameters().forEach((parameter, index) => {
        findGaps(checker.getTypeOfSymbol(parameter), shape?.args?.[index], `${position}(${index})`, gaps, seen);
      });
      findGaps(signature.getReturnType(), shape?.returns, `${position}=>`, gaps, seen);
    }
  }
}

test('every export of Svelte and SvelteKit has its names covered, or a reason in LEFT_OUT', () => {
  const gaps = new Map<string, Set<string>>();
  const typeExports = new Map<string, ts.Symbol>();
  for (const [path, module] of svelteModules()) {
    for (const { name, symbol } of moduleExports(module)) {
      if (symbol.flags & ts.SymbolFlags.Type) typeExports.set(`${path}:${name}`, symbol);
      if (symbol.flags & ts.SymbolFlags.Value) {
        findGaps(checker.getTypeOfSymbol(symbol), MODULE_SHAPES[path]?.[name], `${path}:${name}`, gaps);
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
    findGaps(checker.getDeclaredTypeOfSymbol(symbol), specialExports(file)[exportName], `${file} ${exportName}`, gaps);
  }

  const uncovered = [...gaps].map(([position, names]) => `${position}: ${[...names].join(', ')}`);
  assert.deepEqual(uncovered, [], `Names with no shape and no reason in LEFT_OUT:\n${uncovered.join('\n')}`);
});
