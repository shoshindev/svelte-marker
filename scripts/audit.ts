// Runs the marker over real projects, to find wrong or missing marks and slow
// files that the small examples in the tests can't show. Pass one or more folders:
//   npm run audit-marks -- ../my-app
// It prints every distinct piece of text that got a mark, so an odd one stands
// out, then the lines that look like Svelte syntax but got no mark, then the
// slowest files. Comments and strings show up among the unmarked lines, because
// the marker leaves them alone on purpose, so read past those.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findMarks } from '../src/findMarks.ts';
import { isKitProject } from '../src/kitProject.ts';
import { shouldScan } from '../src/svelteNames.ts';

// Folders that hold builds or dependencies. Hidden folders, like .git and
// .svelte-kit, are skipped too, since they hold tools' files and copies of the project.
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'coverage']);

// Lines with Svelte syntax, a rune, a store or an import of Svelte's.
const LOOKS_LIKE_SVELTE =
  /\{[#:@/]|\{\.\.\.|\b(bind|use|transition|in|out|animate|class|style|let):[\w-]|<\/?svelte:|\$(state|derived|effect|props|bindable|inspect|host)\b|from\s+['"](svelte|\$app|\$env|\$lib|@sveltejs)|\$[a-z]\w*\s*[.=;)]/;

const MOST_UNMARKED_LINES = 50;
const SLOWEST_FILES = 5;

function filesUnder(folder: string, found: string[] = []): string[] {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_FOLDERS.has(name) && !name.startsWith('.')) filesUnder(path, found);
      continue;
    }
    if (/\.(svelte|js|mjs|ts|mts|html)$/.test(name)) found.push(path);
  }
  return found;
}

const folders = process.argv.slice(2);
if (folders.length === 0) {
  console.error('Pass the folders to scan: npm run audit-marks -- ../my-app');
  process.exit(1);
}

const marked = new Map<string, number>();
const unmarked: string[] = [];
const incomplete: string[] = [];
const timings: { ms: number; file: string; size: number }[] = [];
let scanned = 0;
let skipped = 0;
let lines = 0;

for (const folder of folders) {
  for (const file of filesUnder(folder)) {
    const text = readFileSync(file, 'utf8');
    const inKitProject = isKitProject(file);
    if (!shouldScan(file, text, inKitProject)) {
      skipped++;
      continue;
    }
    scanned++;
    const shown = relative(process.cwd(), file);
    const started = performance.now();
    const result = findMarks(text, file, inKitProject);
    timings.push({ ms: performance.now() - started, file: shown, size: text.length });
    if (!result.complete) incomplete.push(shown);
    for (const mark of result.marks) {
      const piece = text.slice(mark.start, mark.end);
      marked.set(piece, (marked.get(piece) ?? 0) + 1);
    }

    let offset = 0;
    for (const [index, line] of text.split('\n').entries()) {
      const start = offset;
      const end = offset + line.length;
      offset = end + 1;
      lines++;
      if (!LOOKS_LIKE_SVELTE.test(line)) continue;
      if (result.marks.some((mark) => mark.start < end && mark.end > start)) continue;
      unmarked.push(`${shown}:${index + 1}  ${line.trim().slice(0, 100)}`);
    }
  }
}

const totalMs = timings.reduce((sum, item) => sum + item.ms, 0);
const totalMarks = [...marked.values()].reduce((sum, count) => sum + count, 0);
console.log(`${scanned} files scanned, ${skipped} skipped, ${totalMarks} marks, ${totalMs.toFixed(0)} ms in all`);

console.log(`\nFiles that didn't parse whole (${incomplete.length}):`);
for (const file of incomplete) console.log(`  ${file}`);

// Syntax like `{#if` is listed too, because a mark that runs past its token, like
// `load: PageLoad`, shows up here as an odd piece of text.
const pieces = [...marked].sort(([a], [b]) => a.localeCompare(b));
console.log(`\nDistinct marked text (${pieces.length}):`);
console.log(pieces.map(([piece, count]) => `${piece.replace(/\n/g, '\\n')}×${count}`).join('  '));

console.log(`\nLines that look like Svelte but got no mark (${unmarked.length} of ${lines} lines):`);
for (const line of unmarked.slice(0, MOST_UNMARKED_LINES)) console.log(`  ${line}`);
if (unmarked.length > MOST_UNMARKED_LINES) console.log(`  ... and ${unmarked.length - MOST_UNMARKED_LINES} more`);

console.log('\nSlowest files:');
for (const { ms, file, size } of timings.sort((a, b) => b.ms - a.ms).slice(0, SLOWEST_FILES)) {
  console.log(`  ${ms.toFixed(1)} ms  ${(size / 1000).toFixed(0)} KB  ${file}`);
}
