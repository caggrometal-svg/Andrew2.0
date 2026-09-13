import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyPairSync, createSign } from 'node:crypto';
import Fastify from 'fastify';

import {
  bridgeDeviceAttestationHeaders,
  verifyBridgeDeviceAttestation,
} from '../server/auth/bridge-v3-device.mjs';

const mockedStore = {
  initializeBridgeStore: async () => undefined,
  listPendingBridgeCommands: async () => [],
  getBridgeSyncState: async () => ({ serverTime: 1_700_000_000_000, cursor: 1_700_000_000_000, pending: [{ id: 'cmd-1', command: 'request_status', createdAt: 1_700_000_000_000, expiresAt: 1_700_300_000_000 }] }),
  acknowledgeBridgeCommand: async () => ({ id: 'cmd-1', command: 'request_status' }),
};
const mockedOpenAI = { getAIProviderHealth: () => ({ policy: 'balanced', providers: {} }) };
const mockedController = { queueBridgeAction: async () => ({ queued: false, error: 'write_disabled' }) };

const DEVICE_ID = 'camilo-test';
const { privateKey, publicKey } = createKeyPairSync('ec', { namedCurve: 'secp256r1' });
const PUB_SPKI = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function attestation(deviceId = DEVICE_ID, urlPath = '/api/v1/bridge/v3/sync', timestamp = Date.now()) {
  const timestampText = String(timestamp);
  const canonical = `${deviceId}.${timestampText}.${urlPath}`;
  const signer = createSign('sha256');
  signer.update(canonical);
  signer.end();
  return {
    'x-device-id': deviceId,
    'x-timestamp': timestampText,
    'x-signature': signer.sign({ key: privateKey, dsaEncoding: 'der' }).toString('base64'),
  };
}

viMock();

function viMock() {
  globalThis.__bridgeMocks = { mockedStore, mockedOpenAI, mockedController };
}

async function buildApp() {
  process.env.BRIDGE_DEVICE_PUBLIC_KEYS = JSON.stringify({ [DEVICE_ID]: PUB_SPKI });
  process.env.BRIDGE_ARTIFACT_MANIFEST_JSON = JSON.stringify({
    revisionId: 'rev_2026_09_13_01',
    previousRevisionId: 'rev_2026_09_13_00',
    sha256Hex: 'a'.repeat(64),
    signatureBase64: 'test-signature',
    downloadUrl: 'https://example.invalid/andrew-web-sandbox.zip',
  });
  const app = Fastify();
  const { registerBridgeV3Routes } = await import('../server/routes/bridge-v3.mjs');
  await registerBridgeV3Routes(app);
  return app;
}

afterEach(() => {
  delete process.env.BRIDGE_DEVICE_PUBLIC_KEYS;
  delete process.env.BRIDGE_ARTIFACT_MANIFEST_JSON;
});

test('Phase 30: accepts a valid device-attested sync and returns the authoritative artifact manifest', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: attestation() });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().deviceId, DEVICE_ID);
  assert.equal(response.json().artifact.revisionId, 'rev_2026_09_13_01');
  assert.equal(response.json().pending[0].id, 'cmd-1');
  await app.close();
});

test('Phase 30: rejects missing attestation headers', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync' });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, 'identity_required');
  await app.close();
});

test('Phase 30: rejects unknown devices and invalid signatures', async () => {
  const app = await buildApp();
  const unknown = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: attestation('unknown-device') });
  assert.equal(unknown.statusCode, 401);
  assert.equal(unknown.json().error, 'device_unknown');

  const invalid = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: { ...attestation(), 'x-signature': attestation(DEVICE_ID, '/wrong-url')['x-signature'] } });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().error, 'attestation_invalid');
  await app.close();
});

test('Phase 30: rejects attestations outside the ±300 second freshness window', async () => {
  const app = await buildApp();
  const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: attestation(DEVICE_ID, '/api/v1/bridge/v3/sync', Date.now() - 301_000) });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, 'attestation_expired');
  await app.close();
});

test('Phase 30: unified ACK accepts revisionId without a command id', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/bridge/v3/ack',
    headers: { ...attestation(DEVICE_ID, '/api/v1/bridge/v3/ack'), 'content-type': 'application/json' },
    payload: { revisionId: 'rev_2026_09_13_01', ok: true },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().revisionId, 'rev_2026_09_13_01');
  await app.close();
});

test('Phase 30: unified ACK rejects payloads without id or revisionId', async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/bridge/v3/ack',
    headers: { ...attestation(DEVICE_ID, '/api/v1/bridge/v3/ack'), 'content-type': 'application/json' },
    payload: { ok: true },
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { ok: false, error: 'invalid_payload' });
  await app.close();
});

test('Phase 30: verifier signs the exact canonical request string', () => {
  const headers = attestation();
  const result = verifyBridgeDeviceAttestation({
    ...bridgeDeviceAttestationHeaders({ headers }),
    url: '/api/v1/bridge/v3/sync',
  });
  assert.equal(result.ok, true);
});
