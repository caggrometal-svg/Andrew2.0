import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { canonicalBridgeSignature } from '../server/bridge/bridge-auth.mjs';

const port = Number(process.env.PHASE25_E2E_PORT || 18787);
const base = `http://127.0.0.1:${port}`;
const userId = `phase25-e2e-${process.pid}`;
const pairingCode = crypto.randomBytes(24).toString('base64url');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
let server;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitReady() {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try { if ((await fetch(`${base}/health`)).status === 200) return; } catch {}
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
async function chat(body, headers) { return fetch(`${base}/api/chat`, { method: 'POST', headers, body }); }

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ANDREW_BRIDGE_PAIRING_CODE: pairingCode },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => process.stdout.write(`[REAL-SERVER] ${chunk}`));
  server.stderr.on('data', chunk => process.stderr.write(`[REAL-SERVER] ${chunk}`));
  await waitReady();
  const response = await fetch(`${base}/api/v1/bridge/pairing`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, publicKeyBase64, pairingCode }) });
  assert.equal(response.status, 201, await response.text());
  console.log('[E2E TRACE] keypair -> real pairing route -> public key registered');
});

after(async () => { if (server) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); } });

test('E2E 1 missing headers', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-1', conversationId: 'phase25-e2e-1' });
  const response = await chat(body, { 'content-type': 'application/json' });
  const data = await response.json();
  assert.equal(response.status, 401); assert.equal(data.error, 'MISSING_SECURITY_HEADERS');
  console.log('[E2E TRACE] real /api/chat -> middleware -> 401 MISSING_SECURITY_HEADERS');
});

test('E2E 2 invalid signature', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-2', conversationId: 'phase25-e2e-2' });
  const headers = sign(body); headers['x-andrew-signature'] = headers['x-andrew-signature'].slice(0, -2) + 'aa';
  const response = await chat(body, headers); const data = await response.json();
  assert.equal(response.status, 401); assert.equal(data.error, 'INVALID_SIGNATURE');
  console.log('[E2E TRACE] real /api/chat -> middleware -> 401 INVALID_SIGNATURE');
});

test('E2E 3 replay nonce', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-3', conversationId: 'phase25-e2e-3' });
  const headers = sign(body); const first = await chat(body, headers);
  assert.equal(first.status, 200, await first.text());
  const replay = await chat(body, headers); const data = await replay.json();
  assert.equal(replay.status, 401); assert.equal(data.error, 'REPLAY_ATTACK_DETECTED');
  console.log('[E2E TRACE] real /api/chat -> ProviderRouter -> 200; replay -> 401 REPLAY_ATTACK_DETECTED');
});

test('E2E 4 expired timestamp', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-4', conversationId: 'phase25-e2e-4' });
  const response = await chat(body, sign(body, Date.now() - 600000)); const data = await response.json();
  assert.equal(response.status, 401); assert.equal(data.error, 'TIMESTAMP_EXPIRED');
  console.log('[E2E TRACE] real /api/chat -> middleware -> 401 TIMESTAMP_EXPIRED');
});

test('E2E 5 valid signature and paired key', async () => {
  const body = JSON.stringify({ message: 'phase25-e2e-5', conversationId: 'phase25-e2e-5' });
  const response = await chat(body, sign(body)); const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data)); assert.equal(data.ok, true); assert.equal(typeof data.reply, 'string');
  console.log(`[E2E TRACE] real /api/chat -> real ProviderRouter -> 200 provider=${data.provider}`);
});
