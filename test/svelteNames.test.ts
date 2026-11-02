// Checks the shapes in src/shapes.ts against the types that Svelte, SvelteKit
// and the official adapters publish. An update that adds, renames or removes a
// name makes this fail: add the new name to the shape, or move a removed one to
// the shape's `older` list.
//   npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-6';
import { MODULE_SHAPES, OWN_DIRECTIVES, type Shape, type ShapeRef, SHAPES } from '../src/shapes.ts';
import { kitProps, specialExports } from '../src/svelteNames.ts';

const TYPES_FILE = fileURLToPath(new URL('svelteTypes.ts', import.meta.url));

// `prototype` is plain JS. `#private`, `$$_attributes` and symbol keys are
// TypeScript bookkeeping that no one writes.
function isWrittenName(name: string): boolean {
  return name !== 'prototype' && !name.startsWith('#') && !name.startsWith('$$_') && !name.startsWith('__@');
}

// Reads the member names of each type exported from test/svelteTypes.ts.
// TypeScript 7, which checks this project, has no API for reading types yet,
// so this uses TypeScript 6.
function readTypes(): Map<string, Set<string>> {
  const program = ts.createProgram([TYPES_FILE], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: [],
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(TYPES_FILE)!;
  const errors = ts.getPreEmitDiagnostics(program, source);
  assert.deepEqual(
    errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')),
    [],
    'test/svelteTypes.ts has type errors',
  );

  const types = new Map<string, Set<string>>();
  for (const statement of source.statements) {
    if (!ts.isTypeAliasDeclaration(statement)) continue;
    if (!statement.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const type = checker.getTypeAtLocation(statement.name);
    // A union like Navigation has every name that any of its kinds has.
    const parts = type.isUnion() ? type.types : [type];
    const names = parts.flatMap((part) => checker.getPropertiesOfType(part).map((item) => item.name));
    types.set(statement.name.text, new Set(names.filter(isWrittenName)));
  }
  return types;
}

const types = readTypes();

// Every shape that a shape, a module or a SvelteKit file points at by name.
function namedShapes(ref: ShapeRef | null | undefined): string[] {
  if (typeof ref === 'string') return [ref];
  if (!ref) return [];
  const shape: Shape = ref;
  return [
    ...Object.values(shape.members ?? {}),
    ...(shape.args ?? []),
    shape.anyKey,
    shape.returns,
    shape.items,
    shape.value,
  ].flatMap(namedShapes);
}

test('every shape has a type to check it against', () => {
  assert.deepEqual(Object.keys(SHAPES).sort(), [...types.keys()].sort());
});

test('each shape lists the same names as its type', () => {
  for (const [name, members] of types) {
    assert.deepEqual(new Set(Object.keys(SHAPES[name]?.members ?? {})), members, name);
  }
});

test('names from older versions are gone from the types', () => {
  for (const [name, shape] of Object.entries(SHAPES)) {
    for (const older of shape.older ?? []) {
      assert.ok(!types.get(name)?.has(older), `${name} has ${older} again, so it belongs in members`);
    }
  }
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
