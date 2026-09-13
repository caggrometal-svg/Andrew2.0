import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import crypto from 'node:crypto';
import { canonicalBridgeSignature, resetBridgeAuthForTests, verifyBridgeSignature } from '../server/bridge/bridge-auth.mjs';

const body = JSON.stringify({ message: 'phase25', conversationId: 'phase25-e2e' });
const userId = 'phase25-http-device';
const keys = crypto.generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
const privateKey = keys.privateKey;
const signed = (timestamp = Date.now(), nonce = crypto.randomUUID(), key = privateKey) => {
  const payload = canonicalBridgeSignature({ userId, timestamp, nonce, body });
  return {
    'x-andrew-user-id': userId,
    'x-andrew-timestamp': String(timestamp),
    'x-andrew-nonce': nonce,
    'x-andrew-signature': crypto.sign(null, Buffer.from(payload), key).toString('base64url'),
  };
};

function buildApp() {
  const app = Fastify();
  app.addHook('preValidation', async (request, reply) => {
    const result = verifyBridgeSignature({ headers: request.headers, body: body, publicKey });
    if (!result.ok) return reply.code(401).send({ ok: false, error: result.error });
  });
  app.post('/api/chat', async () => ({ ok: true }));
  return app;
}

test.beforeEach(() => resetBridgeAuthForTests());

test('E2E TEST 1: missing headers -> 401', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'POST', url: '/api/chat', payload: body });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test('E2E TEST 2: invalid signature -> 401', async () => {
  const app = buildApp();
  const headers = signed();
  headers['x-andrew-signature'] = `${headers['x-andrew-signature'].slice(0, -2)}aa`;
  const response = await app.inject({ method: 'POST', url: '/api/chat', headers, payload: body });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test('E2E TEST 3: replay nonce -> 401', async () => {
  const app = buildApp();
  const headers = signed();
  assert.equal((await app.inject({ method: 'POST', url: '/api/chat', headers, payload: body })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/chat', headers, payload: body })).statusCode, 401);
  await app.close();
});

test('E2E TEST 4: expired timestamp -> 401', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'POST', url: '/api/chat', headers: signed(Date.now() - 600000), payload: body });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test('E2E TEST 5: valid Ed25519 signature -> 200', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'POST', url: '/api/chat', headers: signed(), payload: body });
  assert.equal(response.statusCode, 200);
  await app.close();
});
