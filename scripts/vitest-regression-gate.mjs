import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const excluded = new Set([
  'tests/phase25-bridge-security-v2.test.mjs',
  'tests/phase25-http-e2e.test.mjs',
  'tests/phase25-http-real-e2e.test.mjs',
]);
const testPattern = /(?:\.test|\.spec)\.(?:mjs|cjs|js|mts|cts|ts|tsx|jsx)$/;
const vitestImport = /from\s+['"]vitest['"]|import\s*\{[^}]*\}\s*from\s*['"]vitest['"]/s;
const testDeclaration = /\b(?:describe|suite|it|test)\s*\(/;

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (testPattern.test(entry.name)) files.push(full);
  }
  return files;
}

const candidates = walk(path.join(root, 'tests')).concat(walk(path.join(root, 'src')));
const emptyVitestSuites = [];
for (const file of candidates) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (excluded.has(relative)) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (vitestImport.test(source) && !testDeclaration.test(source)) emptyVitestSuites.push(relative);
}

console.log(`VITEST_EMPTY_SUITE_COUNT=${emptyVitestSuites.length}`);
if (emptyVitestSuites.length) {
  console.error('Vitest test files with no test declaration:');
  for (const file of emptyVitestSuites) console.error(`- ${file}`);
  process.exit(1);
}
console.log('AUTONOMOUS_REGRESSION_GATE=GREEN');
