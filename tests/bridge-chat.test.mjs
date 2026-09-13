import test from 'node:test';
import assert from 'node:assert/strict';
import { registerChatV1Route } from '../server/routes/chat-v1.mjs';

function fakeProvider() {
  return {
    id: 'fake',
    async execute(request) {
      return { provider: 'fake', model: request.model || 'test-model', content: 'bridge-ok' };
    },
  };
}

function routeHarness() {
  let handler;
  return {
    post(_path, nextHandler) { handler = nextHandler; },
    getHandler() { assert.ok(handler); return handler; },
  };
}

function replyHarness() {
  return {
    code(statusCode) { this.statusCode = statusCode; return this; },
    send(body) { this.body = body; return body; },
  };
}

test('chat bridge returns structured provider response', async () => {
  const app = routeHarness();
  await registerChatV1Route(app, { provider: fakeProvider() });
  const reply = replyHarness();
  const result = await app.getHandler()({ body: { messages: [{ role: 'user', content: 'hello' }], model: 'test-model' }, log: {} }, reply);
  assert.deepEqual(result, { ok: true, provider: 'fake', model: 'test-model', content: 'bridge-ok' });
});

test('chat bridge rejects malformed messages', async () => {
  const app = routeHarness();
  await registerChatV1Route(app, { provider: fakeProvider() });
  const reply = replyHarness();
  const result = await app.getHandler()({ body: { messages: [{ role: 'user', content: 123 }] }, log: {} }, reply);
  assert.equal(reply.statusCode, 400);
  assert.deepEqual(result, { ok: false, error: 'invalid_messages' });
});
