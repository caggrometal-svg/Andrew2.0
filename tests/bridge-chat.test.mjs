import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerChatV1Route } from '../server/routes/chat-v1.mjs';

function fakeProvider() {
  return {
    id: 'fake',
    async execute(request) {
      return { provider: 'fake', model: request.model || 'test-model', content: 'bridge-ok' };
    },
  };
}

test('chat bridge returns structured provider response', async () => {
  const app = Fastify();
  await registerChatV1Route(app, { provider: fakeProvider() });
  const response = await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { messages: [{ role: 'user', content: 'hello' }] } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, provider: 'fake', model: 'test-model', content: 'bridge-ok' });
  await app.close();
});

test('chat bridge rejects malformed messages', async () => {
  const app = Fastify();
  await registerChatV1Route(app, { provider: fakeProvider() });
  const response = await app.inject({ method: 'POST', url: '/api/v1/chat', payload: { messages: [{ role: 'user', content: 123 }] } });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'invalid_messages');
  await app.close();
});
