import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.resolve('scripts/install-android-bridge.mjs'), 'utf8');

describe('Phase 23 native Android bridge', () => {
  it('installs exactly the four allow-listed bridge operations', () => {
    expect(script).toContain('openSettings');
    expect(script).toContain('setRuntimeParameter');
    expect(script).toContain('requestStatus');
    expect(script).toContain('syncNow');
  });

  it('uses the Android JavaScript interface and explicit settings intent', () => {
    expect(script).toContain('addJavascriptInterface');
    expect(script).toContain('Settings.ACTION_SETTINGS');
    expect(script).toContain('SharedPreferences');
  });

  it('rejects unrestricted runtime parameter writes', () => {
    expect(script).toContain('ALLOWED_PARAMETERS');
    expect(script).toContain('key.length() > 64');
    expect(script).toContain('value.length() > 256');
    expect(script).not.toContain('Runtime.getRuntime');
    expect(script).not.toContain('exec(');
    expect(script).not.toContain('executeShell');
    expect(script).not.toContain('runCommand');
  });
});
