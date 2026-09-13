import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import Fastify from 'fastify';
import { registerBridgeV3Routes } from '../server/routes/bridge-v3.mjs';

const mockedStore = {
  initializeBridgeStore: mock.fn(async () => undefined),
  listPendingBridgeCommands: mock.fn(async () => []),
  getBridgeSyncState: mock.fn(async () => ({
    serverTime: 1_700_000_000_000,
    cursor: 1_700_000_000_000,
    pending: [{ id: 'cmd-1', command: 'request_status', createdAt: 1_700_000_000_000, expiresAt: 1_700_300_000_000 }],
  })),
  acknowledgeBridgeCommand: mock.fn(),
};
const mockedOpenAI = {
  getAIProviderHealth: mock.fn(() => ({ policy: 'balanced', providers: {} })),
};
const mockedController = {
  queueBridgeAction: mock.fn(),
};

function registerWithMocks(app) {
  return registerBridgeV3Routes(app, {
    ...mockedStore,
    ...mockedOpenAI,
    ...mockedController,
  });
}

describe('Phase 30 bridge synchronization', () => {
  it('returns a single authoritative sync snapshot for an authenticated bridge identity', async () => {
    const app = Fastify();
    await registerWithMocks(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/bridge/v3/sync',
      headers: { 'x-andrew-user-id': 'camilo-test' },
    });
    const body = response.json();
    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.userId, 'camilo-test');
    assert.equal(body.cursor, 1_700_000_000_000);
    assert.equal(body.pending.length, 1);
    assert.equal(body.ai.policy, 'balanced');
    assert.deepEqual(mockedStore.getBridgeSyncState.mock.calls[0].arguments, ['camilo-test']);
    await app.close();
  });

  it('rejects sync without bridge identity', async () => {
    const app = Fastify();
    await registerWithMocks(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync' });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { ok: false, error: 'identity_required' });
    await app.close();
  });
});
