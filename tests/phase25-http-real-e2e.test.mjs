import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import { canonicalBridgeSignature } from '../server/bridge/bridge-auth.mjs';

const port = Number(process.env.PHASE25_E2E_PORT || 18787);
const providerPort = Number(process.env.PHASE25_PROVIDER_PORT || 18788);
const base = `http://127.0.0.1:${port}`;
const providerBase = `http://127.0.0.1:${providerPort}`;
const userId = `phase25-e2e-${process.pid}`;
const pairingCode = crypto.randomBytes(24).toString('base64url');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
let server;
let providerServer;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`PHASE25_TIMEOUT:${label}`)), ms))]);
}
async function waitReady(url, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })).status === 200) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('REAL_FASTIFY_START_TIMEOUT');
}
function sign(body, timestamp = Date.now(), nonce = crypto.randomUUID()) {
  const canonical = canonicalBridgeSignature({ userId, timestamp, nonce, body });
  return {
    'content-type': 'application/json',
    'x-andrew-user-id': userId,
    'x-andrew-timestamp': String(timestamp),
    'x-andrew-nonce': nonce,
    'x-andrew-signature': crypto.sign(null, Buffer.from(canonical), privateKey).toString('base64url'),
  };
}
async function chat(body, headers) {
  return withTimeout(fetch(`${base}/api/chat`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) }), 12000, 'chat');
}

before(async () => {
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
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ output_text: 'phase25-provider-e2e-ok' }));
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: error.message } }));
      }
    });
  });
  await withTimeout(new Promise((resolve, reject) => {
    providerServer.once('error', reject);
    providerServer.listen(providerPort, '127.0.0.1', resolve);
  }), 5000, 'provider-start');

  server = spawn(process.execPath, ['--import', 'tsx', 'server/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, OPENAI_API_KEY: 'phase25-e2e-test-key', OPENAI_MODEL: 'gpt-5.6-luna', AI_PRIMARY_ENDPOINT: `${providerBase}/v1/responses`, AI_ROUTING_POLICY: 'primary', PORT: String(port), HOST: '127.0.0.1', ANDREW_BRIDGE_PAIRING_CODE: pairingCode },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => process.stdout.write(`[REAL-SERVER] ${chunk}`));
  server.stderr.on('data', (chunk) => process.stderr.write(`[REAL-SERVER] ${chunk}`));
  server.once('error', (error) => { throw error; });
  await waitReady(base);
  const response = await withTimeout(fetch(`${base}/api/v1/bridge/pairing`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, publicKeyBase64, pairingCode }), signal: AbortSignal.timeout(5000) }), 7000, 'pairing');
  assert.equal(response.status, 201, await response.text());
});

after(async () => {
  if (server) {
    server.kill('SIGTERM');
    if (!server.killed) server.kill('SIGKILL');
    await withTimeout(new Promise((resolve) => {
      if (server.exitCode !== null) return resolve();
      server.once('exit', resolve);
    }), 5000, 'server-shutdown').catch(() => { if (server && server.exitCode === null) server.kill('SIGKILL'); });
  }
  if (providerServer) await withTimeout(new Promise((resolve) => providerServer.close(resolve)), 5000, 'provider-shutdown').catch(() => {});
});

test('E2E 1 missing headers', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-1', conversationId: 'phase25-e2e-1' });
  const response = await chat(body, { 'content-type': 'application/json' });
  const data = await response.json();
  assert.equal(response.status, 401); assert.equal(data.error, 'MISSING_SECURITY_HEADERS');
});

test('E2E 2 invalid signature', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-2', conversationId: 'phase25-e2e-2' });
  const headers = sign(body); headers['x-andrew-signature'] = `${headers['x-andrew-signature'].slice(0, -2)}aa`;
  const response = await chat(body, headers); const data = await response.json();
  assert.equal(response.status, 401); assert.equal(data.error, 'INVALID_SIGNATURE');
});

test('E2E 3 replay nonce', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-3', conversationId: 'phase25-e2e-3' });
  const headers = sign(body); const first = await chat(body, headers);
  assert.equal(first.status, 200, await first.text());
  const replay = await chat(body, headers); const data = await replay.json();
  assert.equal(replay.status, 401); assert.equal(data.error, 'REPLAY_ATTACK_DETECTED');
});

test('E2E 4 expired timestamp', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-4', conversationId: 'phase25-e2e-4' });
  const response = await chat(body, sign(body, Date.now() - 600000)); const data = await response.json();
  assert.equal(response.status, 401); assert.equal(data.error, 'TIMESTAMP_EXPIRED');
});

test('E2E 5 valid signature and paired key', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-5', conversationId: 'phase25-e2e-5' });
  const response = await chat(body, sign(body)); const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.ok, true);
  assert.equal(typeof data.reply, 'string');
  assert.equal(data.provider, 'primary');
  assert.equal(data.reply, 'phase25-provider-e2e-ok');
});

test('E2E deterministic provider contract', () => {
  assert.equal(typeof canonicalBridgeSignature, 'function');
  assert.match(providerBase, /^http:\/\/127\.0\.0\.1:/);
});
