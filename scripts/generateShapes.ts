// Writes src/generatedShapes.ts: a shape for every export of Svelte, SvelteKit
// and the official adapters that src/shapes.ts doesn't describe by hand, and for
// the types in scripts/shapeRoots.ts. Run it after updating any of them:
//   npm run shapes
// test/svelteNames.test.ts fails while the file is out of date.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HAND_MODULE_SHAPES, HAND_SHAPES } from '../src/shapes.ts';
import {
  checker,
  exportedTypes,
  fixedValues,
  isArray,
  isLeftOut,
  isObject,
  itemTypes,
  kindsOf,
  moduleExports,
  ROOT_TYPES_FILE,
  signaturesOf,
  svelteMembers,
  svelteModules,
  ts,
} from './typeReader.ts';

export const OUTPUT_FILE = fileURLToPath(new URL('../src/generatedShapes.ts', import.meta.url));

interface Draft {
  members: Map<string, string | null>;
  args: (string | null)[];
  returns: string | null;
  items: string | null;
  anyKey: string | null;
  values: string[];
}

// A name like `svelte/compiler.AST.Root` for a type that Svelte's files name,
// with the package in place of a file path. Others get no name.
function qualifiedName(symbol: ts.Symbol | undefined): string | undefined {
  const declaration = symbol?.declarations?.[0];
  if (!symbol || !declaration || !/node_modules\/(svelte|@sveltejs)\//.test(declaration.getSourceFile().fileName)) return;
  const name = checker
    .getFullyQualifiedName(symbol)
    .replace(/^"([^"]+)"\./, (_, module: string) =>
      `${module.replace(/^.*node_modules\//, '').replace(/\/(types\/)?index(\.d\.ts)?$/, '')}:`,
    );
  if (name.includes('__')) return;
  if (name.includes(':')) return name.replace(':', '.');
  // A type the module declares without exporting it gets no module in its name.
  let node: ts.Node | undefined = declaration;
  while (node && !(ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name))) node = node.parent;
  return node ? `${(node as ts.ModuleDeclaration).name.text}.${name}` : name;
}

export function generateShapes(): string {
  const drafts = new Map<string, Draft>();
  const renames = new Map<string, string>(); // a root's name for a shape built before it
  const built = new Map<string, string | null>(); // the types at a place, by id, to the shape's name
  const id = (type: ts.Type) => (type as any).id as number;

  function claimName(wanted: string): string {
    let name = wanted;
    for (let count = 2; drafts.has(name) || Object.hasOwn(HAND_SHAPES, name); count++) name = `${wanted}#${count}`;
    return name;
  }

  // Describes the types found at one place, like the return value of parse(),
  // and returns the name of the shape, or null if they hold no names of Svelte's.
  function build(types: readonly ts.Type[], position: string, forcedName?: string): string | null {
    if (isLeftOut(position)) return null;
    const kinds = [...new Set(types.flatMap(kindsOf))];
    const arrays = kinds.filter(isArray);
    const objects = kinds.filter((type) => !isArray(type) && isObject(type));
    const strings = kinds.filter((type) => type.isStringLiteral());
    if (arrays.length + objects.length + strings.length === 0) return null;
    const key = [...arrays, ...objects, ...strings].map(id).sort((a, b) => a - b).join(',');
    if (built.has(key)) {
      const name = built.get(key)!;
      if (forcedName && name) renames.set(name, forcedName);
      return name;
    }

    // Only a single named type lends the shape its name. One that's either an
    // object or a list of them, like `preprocess`, is named by where it is.
    const single = arrays.length === 0 && objects.length === 1 ? objects[0].getSymbol() : undefined;
    const symbol = types.length === 1 ? (types[0].aliasSymbol ?? single) : undefined;
    const name = claimName(forcedName ?? qualifiedName(symbol) ?? position);
    const draft: Draft = {
      members: new Map(),
      args: [],
      returns: null,
      items: null,
      anyKey: null,
      values: fixedValues(types),
    };
    drafts.set(name, draft);
    built.set(key, name);

    const members = new Map<string, ts.Type[]>();
    for (const object of objects) {
      for (const member of svelteMembers(object)) {
        members.set(member.name, [...(members.get(member.name) ?? []), checker.getTypeOfSymbol(member)]);
      }
    }
    for (const [member, memberTypes] of members) {
      draft.members.set(member, build(memberTypes, `${position}.${member}`));
    }

    const signatures = objects.flatMap(signaturesOf);
    const count = Math.max(0, ...signatures.map((signature) => signature.getParameters().length));
    for (let index = 0; index < count; index++) {
      const parameters = signatures.flatMap((signature) => signature.getParameters()[index] ?? []);
      draft.args.push(build(parameters.map((item) => checker.getTypeOfSymbol(item)), `${position}(${index})`));
    }
    if (signatures.length > 0) {
      draft.returns = build(signatures.map((signature) => signature.getReturnType()), `${position}=>`);
    }

    // A string index signature, like the fields of a remote form, where the keys
    // are yours. A number one makes it a list.
    const indexes = objects.flatMap((object) => checker.getIndexInfosOfType(object));
    const byKey = (flag: ts.TypeFlags) => indexes.filter((info) => info.keyType.flags & flag).map((info) => info.type);
    if (byKey(ts.TypeFlags.String).length > 0) draft.anyKey = build(byKey(ts.TypeFlags.String), `${position}[key]`);
    const items = [...arrays.flatMap(itemTypes), ...byKey(ts.TypeFlags.Number)];
    if (items.length > 0) draft.items = build(items, `${position}[]`);
    return name;
  }

  const modules = new Map<string, Map<string, string>>();
  for (const [path, module] of svelteModules()) {
    for (const { name, symbol } of moduleExports(module)) {
      if (!(symbol.flags & ts.SymbolFlags.Value) || Object.hasOwn(HAND_MODULE_SHAPES[path] ?? {}, name)) continue;
      const ref = build([checker.getTypeOfSymbol(symbol)], `${path}:${name}`);
      if (ref) modules.set(path, (modules.get(path) ?? new Map()).set(name, ref));
    }
  }
  for (const [name, type] of exportedTypes(ROOT_TYPES_FILE)) build([type], name, name);

  // Keep only the shapes that lead to a name or a string of Svelte's: those with
  // members or values, and those that point at one that does. A window's frames
  // point at more windows, but none of them has a name of Svelte's.
  const refsOf = (draft: Draft) =>
    [...draft.members.values(), ...draft.args, draft.returns, draft.items, draft.anyKey].filter(Boolean) as string[];
  const useful = new Set(
    [...drafts].filter(([, draft]) => draft.members.size > 0 || draft.values.length > 0).map(([name]) => name),
  );
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, draft] of drafts) {
      if (!useful.has(name) && refsOf(draft).some((ref) => useful.has(ref))) {
        useful.add(name);
        grew = true;
      }
    }
  }
  const live = (ref: string | null) => (ref && useful.has(ref) ? ref : null);
  for (const [name, draft] of [...drafts]) {
    if (!useful.has(name)) {
      drafts.delete(name);
      continue;
    }
    for (const [member, ref] of draft.members) draft.members.set(member, live(ref));
    draft.args = draft.args.map(live);
    draft.returns = live(draft.returns);
    draft.items = live(draft.items);
    draft.anyKey = live(draft.anyKey);
  }
  // Give the shapes the roots point at the roots' names, and keep one of each
  // set of shapes that came out the same, like those of `innerWidth` and `online`.
  const roots = new Set(exportedTypes(ROOT_TYPES_FILE).keys());
  const target = (ref: string | null) => {
    for (let hops = 0; ref && renames.has(ref) && hops < 100; hops++) ref = renames.get(ref)!;
    return ref;
  };
  for (let changed = true; changed; ) {
    changed = false;
    const seen = new Map<string, string>();
    // Roots go first, so a shape that matches one takes the root's name.
    const ordered = [...drafts].sort(([a], [b]) => Number(roots.has(b)) - Number(roots.has(a)));
    for (const [name, draft] of ordered) {
      for (const [member, ref] of draft.members) draft.members.set(member, target(ref));
      draft.args = draft.args.map(target);
      draft.returns = target(draft.returns);
      draft.items = target(draft.items);
      draft.anyKey = target(draft.anyKey);
      if (renames.has(name)) {
        drafts.delete(name);
        drafts.set(renames.get(name)!, draft);
        changed = true;
        continue;
      }
      const content = JSON.stringify([
        [...draft.members],
        draft.args,
        draft.returns,
        draft.items,
        draft.anyKey,
        draft.values,
      ]);
      const same = seen.get(content);
      if (same && !roots.has(name)) {
        drafts.delete(name);
        renames.set(name, same);
        changed = true;
      } else {
        seen.set(content, name);
      }
    }
  }
  // The first `#2` whose plain name is free again takes it.
  const claimed = new Set<string>();
  for (const name of [...drafts.keys()]) {
    const base = name.replace(/#\d+$/, '');
    if (base !== name && !drafts.has(base) && !claimed.has(base) && !renames.has(base)) {
      renames.set(name, base);
      claimed.add(base);
    }
  }
  for (const [name, draft] of [...drafts]) {
    for (const [member, ref] of draft.members) draft.members.set(member, target(ref));
    draft.args = draft.args.map(target);
    draft.returns = target(draft.returns);
    draft.items = target(draft.items);
    draft.anyKey = target(draft.anyKey);
    if (renames.has(name)) {
      drafts.delete(name);
      drafts.set(target(name)!, draft);
    }
  }
  for (const [path, exports] of modules) {
    for (const [name, ref] of exports) {
      const final = target(ref)!;
      if (drafts.has(final)) exports.set(name, final);
      else exports.delete(name);
    }
    if (exports.size === 0) modules.delete(path);
  }

  return render(drafts, modules);
}

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = (text: string) => (/^[A-Za-z_$][\w$]*$/.test(text) ? text : quote(text));
const ref = (text: string | null) => (text ? quote(text) : 'null');

// Joins items into lines of at most 100 characters.
function wrap(items: string[], indent: string): string {
  const lines: string[] = [];
  for (const item of items) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + item.length + 2 <= 100) lines[lines.length - 1] = `${last} ${item},`;
    else lines.push(`${indent}${item},`);
  }
  return lines.join('\n');
}

function render(drafts: Map<string, Draft>, modules: Map<string, Map<string, string>>): string {
  // A shape that's only a list of strings is written out where it's used.
  const isValuesOnly = (draft: Draft) =>
    draft.values.length > 0 &&
    draft.members.size === 0 &&
    !draft.args.some(Boolean) &&
    !draft.returns &&
    !draft.items &&
    !draft.anyKey;
  const valueList = (draft: Draft) => `[${draft.values.map(quote).join(', ')}]`;
  const refTo = (target: string | null) => {
    const draft = target ? drafts.get(target) : undefined;
    return draft && isValuesOnly(draft) ? `{ values: ${valueList(draft)} }` : ref(target);
  };

  const shapes = [...drafts]
    .filter(([, draft]) => !isValuesOnly(draft))
    .map(([name, draft]) => {
      const fields: string[] = [];
      if (draft.members.size > 0) {
        const members = [...draft.members].map(([member, target]) => `${key(member)}: ${refTo(target)}`);
        fields.push(`    members: {\n${wrap(members, '      ')}\n    },`);
      }
      if (draft.args.some(Boolean)) fields.push(`    args: [${draft.args.map(refTo).join(', ')}],`);
      if (draft.returns) fields.push(`    returns: ${refTo(draft.returns)},`);
      if (draft.items) fields.push(`    items: ${refTo(draft.items)},`);
      if (draft.anyKey) fields.push(`    anyKey: ${refTo(draft.anyKey)},`);
      if (draft.values.length > 0) {
        const line = `    values: ${valueList(draft)},`;
        fields.push(line.length <= 100 ? line : `    values: [\n${wrap(draft.values.map(quote), '      ')}\n    ],`);
      }
      return `  ${quote(name)}: {\n${fields.join('\n')}\n  },`;
    });
  const exports = [...modules].map(
    ([path, entries]) =>
      `  ${quote(path)}: {\n${[...entries].map(([name, target]) => `    ${key(name)}: ${refTo(target)},`).join('\n')}\n  },`,
  );
  return `// Generated by \`npm run shapes\` from the types of Svelte, SvelteKit and the
// official adapters. Don't edit it by hand: run the command again after updating
// any of them. src/shapes.ts holds the shapes written by hand.

import type { Shape, ShapeRef } from './shapes.ts';

export const GENERATED_SHAPES: Record<string, Shape> = {
${shapes.join('\n')}
};

export const GENERATED_MODULES: Record<string, Record<string, ShapeRef>> = {
${exports.join('\n')}
};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = generateShapes();
  if (text !== readFileSync(OUTPUT_FILE, 'utf8')) writeFileSync(OUTPUT_FILE, text);
  console.log(`Wrote ${OUTPUT_FILE.replace(/^.*\/(src\/)/, '$1')}`);
}
