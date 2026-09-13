import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['src/core/config', 'src/core/health', 'src/core/ports'];
const externalImport = /^\s*import\s+(?:type\s+)?[^'"`]+from\s+['"](?!\.)/m;
const forbiddenAny = /\bany\b/;

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

const files = (await Promise.all(roots.map(filesUnder))).flat();
const violations = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  if (forbiddenAny.test(source)) violations.push(`${file}: explicit any is forbidden`);
  if (externalImport.test(source)) violations.push(`${file}: external imports are forbidden in isolated core`);
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exit(1);
}
console.log(`core lint passed: ${files.length} files`);
