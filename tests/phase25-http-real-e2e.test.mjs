import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { canonicalBridgeSignature } from '../server/bridge/bridge-auth.mjs';

const userId = `phase25-e2e-${process.pid}`;
const pairingCode = crypto.randomBytes(24).toString('base64url');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
let app;
let providerServer;
let base;
let providerBase;
let buildServer;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`PHASE25_TIMEOUT:${label}`)), ms)),
  ]);
}

async function waitReady(serverApp, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const address = serverApp.server.address();
    if (address && typeof address === 'object' && address.port > 0) {
      try {
        const response = await fetch(`http://127.0.0.1:${address.port}/health`, { signal: AbortSignal.timeout(2000) });
        if (response.status === 200) return `http://127.0.0.1:${address.port}`;
      } catch {}
    }
    await sleep(50);
  }
  throw new Error('REAL_FASTIFY_START_TIMEOUT');
}

function sign(body, timestamp = Date.now(), nonce = crypto.randomUUID()) {
  const canonical = canonicalBridgeSignature({ userId, timestamp, nonce, body });
  return {
    'accept': 'application/json',
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'x-andrew-user-id': userId,
    'x-andrew-timestamp': String(timestamp),
    'x-andrew-nonce': nonce,
    'x-andrew-signature': crypto.sign(null, Buffer.from(canonical), privateKey).toString('base64url'),
  };
}

async function chat(body, headers) {
  return withTimeout(fetch(`${base}/api/chat`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  }), 12_000, 'chat');
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.PHASE25_E2E = '1';
  process.env.OPENAI_API_KEY = 'phase25-e2e-test-key';
  process.env.OPENAI_MODEL = 'gpt-5.6-luna';
  process.env.AI_ROUTING_POLICY = 'primary';
  process.env.ANDREW_BRIDGE_PAIRING_CODE = pairingCode;

  const providerReady = withTimeout(new Promise((resolve, reject) => {
    providerServer = http.createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        try {
          assert.equal(request.method, 'POST');
          assert.equal(request.url, '/v1/responses');
          const payload = JSON.parse(body || '{}');
          assert.ok(Array.isArray(payload.input));
          response.writeHead(200, {
            'content-type': 'application/json',
            'x-content-type-options': 'nosniff',
          });
          response.end(JSON.stringify({ output_text: 'phase25-provider-e2e-ok' }));
        } catch (error) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { message: error.message } }));
        }
      });
    });
    providerServer.once('error', reject);
    providerServer.listen(0, '127.0.0.1', () => {
      const address = providerServer.address();
      providerBase = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  }), 5_000, 'provider-start');
  await providerReady;

  process.env.AI_PRIMARY_ENDPOINT = `${providerBase}/v1/responses`;

  ({ buildServer } = await import('../server/server.mjs'));
  app = await withTimeout(buildServer({ listen: true, port: 0, host: '127.0.0.1' }), 10_000, 'fastify-build');
  base = await waitReady(app, 10_000);

  const response = await withTimeout(fetch(`${base}/api/v1/bridge/pairing`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-content-type-options': 'nosniff',
    },
    body: JSON.stringify({ userId, publicKeyBase64, pairingCode }),
    signal: AbortSignal.timeout(5_000),
  }), 7_000, 'pairing');
  assert.equal(response.status, 201, await response.text());
});

after(async () => {
  if (app) await withTimeout(app.close(), 5_000, 'server-shutdown').catch(() => {});
  if (providerServer) await withTimeout(new Promise((resolve) => providerServer.close(resolve)), 5_000, 'provider-shutdown').catch(() => {});
});

test('E2E 1 missing headers', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-1', conversationId: 'phase25-e2e-1' });
  const response = await chat(body, { accept: 'application/json', 'content-type': 'application/json', 'x-content-type-options': 'nosniff' });
  const data = await response.json();
  assert.equal(response.status, 401);
  assert.equal(data.error, 'MISSING_SECURITY_HEADERS');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('E2E 2 invalid signature', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-2', conversationId: 'phase25-e2e-2' });
  const headers = sign(body);
  headers['x-andrew-signature'] = `${headers['x-andrew-signature'].slice(0, -2)}aa`;
  const response = await chat(body, headers);
  const data = await response.json();
  assert.equal(response.status, 401);
  assert.equal(data.error, 'INVALID_SIGNATURE');
});

test('E2E 3 replay nonce', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-3', conversationId: 'phase25-e2e-3' });
  const headers = sign(body);
  const first = await chat(body, headers);
  assert.equal(first.status, 200, await first.text());
  const replay = await chat(body, headers);
  const data = await replay.json();
  assert.equal(replay.status, 401);
  assert.equal(data.error, 'REPLAY_ATTACK_DETECTED');
});

test('E2E 4 expired timestamp', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-4', conversationId: 'phase25-e2e-4' });
  const response = await chat(body, sign(body, Date.now() - 600_000));
  const data = await response.json();
  assert.equal(response.status, 401);
  assert.equal(data.error, 'TIMESTAMP_EXPIRED');
});

test('E2E 5 valid signature and paired key', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-5', conversationId: 'phase25-e2e-5' });
  const response = await chat(body, sign(body));
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.ok, true);
  assert.equal(typeof data.reply, 'string');
  assert.equal(data.provider, 'primary');
  assert.equal(data.reply, 'phase25-provider-e2e-ok');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(response.headers.get('x-frame-options'));
});

test('E2E deterministic provider contract', () => {
  assert.equal(typeof canonicalBridgeSignature, 'function');
  assert.equal(typeof buildServer, 'function');
  assert.match(providerBase, /^http:\/\/127\.0\.0\.1:/);
});
