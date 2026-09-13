import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const store = await readFile(new URL('../server/bridge/bridge-store.mjs', import.meta.url), 'utf8');
const route = await readFile(new URL('../server/routes/bridge-v3.mjs', import.meta.url), 'utf8');

describe('Phase 19 Android Bridge persistence contract', () => {
  it('defines a user-scoped durable command table with expiry and acknowledgement state', () => {
    expect(store).toContain('CREATE TABLE IF NOT EXISTS andrew_bridge_commands');
    expect(store).toContain('user_id TEXT NOT NULL');
    expect(store).toContain('expires_at TIMESTAMPTZ NOT NULL');
    expect(store).toContain('acknowledged_at TIMESTAMPTZ');
    expect(store).toContain('ack_ok BOOLEAN');
    expect(store).toContain('ack_error TEXT');
    expect(store).toContain('ON andrew_bridge_commands (user_id, created_at DESC)');
  });

  it('bounds, expires, and correlates commands by user', () => {
    expect(store).toContain('MAX_PENDING = 100');
    expect(store).toContain('expires_at <= NOW()');
    expect(store).toContain('WHERE id = $1 AND user_id = $2');
    expect(store).toContain('acknowledged_at IS NULL');
  });

  it('exposes only poll and acknowledgement paths in addition to command creation', () => {
    expect(route).toContain("/api/v1/bridge/v3/commands");
    expect(route).toContain("/api/v1/bridge/v3/ack");
    expect(route).toContain("command_not_pending");
    expect(route).toContain('function writeEnabled');
    expect(route).toContain('ANDREW_BRIDGE_ALLOW_WRITE');
    expect(route).not.toContain("execute_shell");
  });
});
