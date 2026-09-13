import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');

describe('Phase 29 Andrew bridge E2E architecture', () => {
  it('has the backend command, result, and AI paths', () => {
    const route = read('server/routes/bridge-v3.mjs');
    const resultAI = read('server/bridge/bridge-result-ai.mjs');
    expect(route).toContain('/api/v1/bridge/v3/commands');
    expect(route).toContain('/api/v1/bridge/v3/result');
    expect(resultAI).toContain('createResponse');
  });

  it('has the Android native install path and four allow-listed operations', () => {
    const script = read('scripts/install-android-bridge.mjs');
    expect(script).toContain('addJavascriptInterface');
    for (const operation of ['openSettings', 'setRuntimeParameter', 'requestStatus', 'syncNow']) expect(script).toContain(operation);
    expect(script).not.toContain('Runtime.getRuntime');
    expect(script).not.toContain('exec(');
  });

  it('has the provider fallback path and the application loop', () => {
    const router = read('server/ai/provider-router.mjs');
    const loop = read('src/network/bridgeCommandLoop.ts');
    expect(router).toContain('policyOrder');
    expect(router).toContain('recordFailure');
    expect(router).toContain('AIServiceUnavailableError');
    expect(router).toContain("provider.router.exhausted");
    expect(loop).toContain('/api/chat');
    expect(loop).toContain('/api/v1/bridge/v3/result');
  });
});
