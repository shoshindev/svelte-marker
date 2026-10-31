// Writes THIRD-PARTY-NOTICES.md. The extension bundles Svelte's prebuilt compiler,
// which has Svelte's own dependencies inside it, so their licenses ship with it too.
// Packaging runs this, so the file always matches the pinned version of Svelte.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

function readPackage(name) {
  return JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
}

function section(name) {
  const { version, license, author } = readPackage(name);
  const file = readdirSync(`node_modules/${name}`).find((entry) => /^licen[cs]e/i.test(entry));
  const text = file
    ? readFileSync(`node_modules/${name}/${file}`, 'utf8').trim()
    : `${license}, by ${author?.name ?? author}. This package includes no license file.`;
  return `## ${name} ${version}\n\nLicense: ${license}\n\n\`\`\`text\n${text}\n\`\`\``;
}

// @types packages only hold type definitions, so none of their code is bundled.
const names = Object.keys(readPackage('svelte').dependencies).filter(
  (name) => !name.startsWith('@types/'),
);

const intro = `# Third-party notices

Svelte Marker includes the Svelte compiler, which has the packages Svelte depends on built into it. Their licenses are below.`;

writeFileSync(
  'THIRD-PARTY-NOTICES.md',
  [intro, ...['svelte', ...names].map(section)].join('\n\n') + '\n',
);
