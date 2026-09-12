import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'capacitor.config.ts',
  'capacitor.config.json',
  'server/config.mjs',
  'server/openai.mjs',
  'server/server.mjs',
  'server/routes/chat.mjs',
  'server/routes/telemetry.mjs',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`FOUNDATION_MISSING:${file}`);
}

const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
const compiler = tsconfig.compilerOptions ?? {};
const strictFlags = [
  'strict',
  'exactOptionalPropertyTypes',
  'noUncheckedIndexedAccess',
  'noPropertyAccessFromIndexSignature',
  'noImplicitReturns',
  'noUnusedLocals',
  'noUnusedParameters',
];
for (const flag of strictFlags) {
  if (compiler[flag] !== true) throw new Error(`FOUNDATION_TS_FLAG_DISABLED:${flag}`);
}

const capacitor = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
if (capacitor.appId !== 'com.andrew.editor') throw new Error(`FOUNDATION_ANDROID_APP_ID:${capacitor.appId}`);
if (capacitor.webDir !== 'dist') throw new Error(`FOUNDATION_CAPACITOR_WEBDIR:${capacitor.webDir}`);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!packageJson.dependencies?.['@capacitor/android']) throw new Error('FOUNDATION_CAPACITOR_ANDROID_DEPENDENCY_MISSING');
if (!packageJson.dependencies?.fastify) throw new Error('FOUNDATION_FASTIFY_DEPENDENCY_MISSING');
if (!packageJson.devDependencies?.typescript) throw new Error('FOUNDATION_TYPESCRIPT_DEPENDENCY_MISSING');

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
if (/\.apk$|(^|\/)build\/outputs\//m.test(tracked)) {
  throw new Error('FOUNDATION_GENERATED_APK_TRACKED');
}

console.log('FOUNDATION=GREEN');
console.log('TypeScript strictness: GREEN');
console.log('Capacitor Android contract: GREEN');
console.log('Backend file contract: GREEN');
console.log('package-lock presence: GREEN');
console.log('Generated APK exclusion: GREEN');
