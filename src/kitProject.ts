// Tells whether a file belongs to a SvelteKit project. Some of SvelteKit's files
// are only known by their path, and `src/hooks.ts` is an ordinary name elsewhere.
// A monorepo can hold both kinds, so this asks the nearest package.json.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Paints happen on every pause in typing, so each folder is only looked up once.
// Adding SvelteKit to a project takes a window reload to show up here.
const answers = new Map<string, boolean>();

function folderIsInKitProject(folder: string): boolean {
  try {
    return readFileSync(join(folder, 'package.json'), 'utf8').includes('"@sveltejs/kit"');
  } catch {
    // No package.json here, so keep walking up. With none at all, nothing rules
    // SvelteKit out, and the file's path is all there is to go on.
    const parent = dirname(folder);
    return parent === folder || folderIsInKitProject(parent);
  }
}

export function isKitProject(filePath: string): boolean {
  const folder = dirname(filePath);
  if (!answers.has(folder)) answers.set(folder, folderIsInKitProject(folder));
  return answers.get(folder)!;
}
