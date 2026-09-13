import { describe, expect, it, vi } from 'vitest';

const mockedStore = vi.hoisted(() => ({
  initializeBridgeStore: vi.fn().mockResolvedValue(undefined),
  listPendingBridgeCommands: vi.fn().mockResolvedValue([]),
  getBridgeSyncState: vi.fn().mockResolvedValue({
    serverTime: 1_700_000_000_000,
    cursor: 1_700_000_000_000,
    pending: [{ id: 'cmd-1', command: 'request_status', createdAt: 1_700_000_000_000, expiresAt: 1_700_300_000_000 }],
  }),
  acknowledgeBridgeCommand: vi.fn(),
}));
const mockedOpenAI = vi.hoisted(() => ({ getAIProviderHealth: vi.fn(() => ({ policy: 'balanced', providers: {} })) }));
const mockedController = vi.hoisted(() => ({ queueBridgeAction: vi.fn() }));

vi.mock('../server/bridge/bridge-store.mjs', () => mockedStore);
vi.mock('../server/openai.mjs', () => mockedOpenAI);
vi.mock('../server/bridge/bridge-controller.mjs', () => mockedController);

import Fastify from 'fastify';
import { registerBridgeV3Routes } from '../server/routes/bridge-v3.mjs';

describe('Phase 30 bridge synchronization', () => {
  it('returns a single authoritative sync snapshot for an authenticated bridge identity', async () => {
    const app = Fastify();
    await registerBridgeV3Routes(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/bridge/v3/sync',
      headers: { 'x-andrew-user-id': 'camilo-test' },
    });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.userId).toBe('camilo-test');
    expect(body.cursor).toBe(1_700_000_000_000);
    expect(body.pending).toHaveLength(1);
    expect(body.ai.policy).toBe('balanced');
    expect(mockedStore.getBridgeSyncState).toHaveBeenCalledWith('camilo-test');
    await app.close();
  });

  it('rejects sync without bridge identity', async () => {
    const app = Fastify();
    await registerBridgeV3Routes(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, error: 'identity_required' });
    await app.close();
  });
});
