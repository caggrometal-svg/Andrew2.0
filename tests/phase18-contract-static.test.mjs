import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync('server/routes/bridge-v3.mjs', 'utf8');
const controller = readFileSync('server/bridge/bridge-controller.mjs', 'utf8');
const client = readFileSync('src/network/androidBridgeV3.ts', 'utf8');

describe('Phase 18 bridge contract hardening', () => {
  it('keeps the server command surface explicitly allow-listed', () => {
    for (const command of ['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']) {
      expect(route).toContain(`'${command}'`);
    }
    expect(route).not.toContain('execute_shell');
    expect(route).toContain('writeEnabled()');
    expect(controller).toContain('ANDREW_BRIDGE_ALLOW_WRITE');
  });

  it('keeps bridge commands bounded and expiring', () => {
    expect(controller).toContain('randomUUID');
    expect(controller).toContain('TTL_MS = 5 * 60 * 1000');
    expect(controller).toContain('entries.length > 8');
    expect(client).toContain('MAX_QUEUE = 100');
    expect(client).toContain('expiresAt');
  });

  it('keeps the native bridge constrained to the four V3 commands', () => {
    expect(client).toContain("'open_settings'");
    expect(client).toContain("'set_runtime_parameter'");
    expect(client).toContain("'request_status'");
    expect(client).toContain("'sync_now'");
    expect(client).not.toContain('execute_shell');
  });
});
