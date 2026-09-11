import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

describe('Phase 16 final certification gate', () => {
  it('declares the required regression command chain', () => {
    const scripts = packageJson.scripts ?? {};
    for (const name of [
      'typecheck', 'build', 'test', 'test:memory', 'test:learning',
      'test:phase4', 'test:phase5', 'test:phase6', 'test:phase7',
      'test:phase8', 'test:phase9', 'test:phase10', 'test:phase11',
      'test:phase12', 'test:phase13', 'test:phase14', 'test:phase15',
    ]) {
      expect(typeof scripts[name], `missing npm script: ${name}`).toBe('string');
    }
  });

  it('contains the production backend and Android build workflow', () => {
    expect(existsSync(resolve(root, 'server/server.mjs'))).toBe(true);
    expect(existsSync(resolve(root, '.github/workflows/android-apk.yml'))).toBe(true);
    expect(existsSync(resolve(root, '.github/workflows/iac33-ci.yml'))).toBe(true);
  });

  it('contains the final release certification record', () => {
    const record = readFileSync(resolve(root, 'docs/PHASE16-RELEASE.md'), 'utf8');
    expect(record).toContain('Phase 16');
    expect(record).toContain('Final Certification');
    expect(record).toContain('Release Gate');
  });
});
