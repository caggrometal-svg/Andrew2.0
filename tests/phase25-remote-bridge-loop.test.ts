import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 25 remote bridge loop', () => {
  it('connects the APK client to the persisted Bridge V3 command and ACK endpoints', () => {
    const source = fs.readFileSync(path.resolve('src/network/bridgeCommandLoop.ts'), 'utf8');
    expect(source).toContain('/api/v1/bridge/v3/commands');
    expect(source).toContain('/api/v1/bridge/v3/ack');
    expect(source).toContain('X-Andrew-User-Id');
    expect(source).toContain('openSettings');
    expect(source).toContain('setRuntimeParameter');
    expect(source).toContain('requestStatus');
    expect(source).toContain('syncNow');
    expect(source).not.toContain('eval(');
    expect(source).not.toContain('new Function(');
  });

  it('activates the loop from the application root', () => {
    const source = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    expect(source).toContain('startBridgeCommandLoop');
  });
});
