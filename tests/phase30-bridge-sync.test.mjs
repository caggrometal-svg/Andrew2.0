import { describe, expect, it, vi } from 'vitest';
import { createKeyPairSync, createSign } from 'node:crypto';

const mockedStore = vi.hoisted(() => ({
  initializeBridgeStore: vi.fn().mockResolvedValue(undefined),
  listPendingBridgeCommands: vi.fn().mockResolvedValue([]),
  getBridgeSyncState: vi.fn().mockResolvedValue({
    serverTime: 1_700_000_000_000,
    cursor: 1_700_000_000_000,
    pending: [{ id: 'cmd-1', command: 'request_status', createdAt: 1_700_000_000_000, expiresAt: 1_700_300_000_000 }],
  }),
  acknowledgeBridgeCommand: vi.fn().mockResolvedValue({ id: 'cmd-1', command: 'request_status' }),
}));
const mockedOpenAI = vi.hoisted(() => ({ getAIProviderHealth: vi.fn(() => ({ policy: 'balanced', providers: {} })) }));
const mockedController = vi.hoisted(() => ({ queueBridgeAction: vi.fn() }));
vi.mock('../server/bridge/bridge-store.mjs', () => mockedStore);
vi.mock('../server/openai.mjs', () => mockedOpenAI);
vi.mock('../server/bridge/bridge-controller.mjs', () => mockedController);

import Fastify from 'fastify';
import { registerBridgeV3Routes } from '../server/routes/bridge-v3.mjs';
import { bridgeDeviceAttestationHeaders, verifyBridgeDeviceAttestation } from '../server/auth/bridge-v3-device.mjs';

const DEVICE_ID = 'camilo-test';
const { privateKey, publicKey } = createKeyPairSync('ec', { namedCurve: 'secp256r1' });
const PUB_SPKI = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function attestation(deviceId = DEVICE_ID, urlPath = '/api/v1/bridge/v3/sync', timestamp = Date.now()) {
  const timestampText = String(timestamp);
  const signer = createSign('sha256');
  signer.update(`${deviceId}.${timestampText}.${urlPath}`);
  signer.end();
  return { 'x-device-id': deviceId, 'x-timestamp': timestampText, 'x-signature': signer.sign({ key: privateKey, dsaEncoding: 'der' }).toString('base64') };
}

async function buildApp() {
  process.env.BRIDGE_DEVICE_PUBLIC_KEYS = JSON.stringify({ [DEVICE_ID]: PUB_SPKI });
  process.env.BRIDGE_ARTIFACT_MANIFEST_JSON = JSON.stringify({ revisionId: 'rev_2026_09_13_01', previousRevisionId: 'rev_2026_09_13_00', sha256Hex: 'a'.repeat(64), signatureBase64: 'test-signature', downloadUrl: 'https://example.invalid/andrew-web-sandbox.zip' });
  const app = Fastify();
  await registerBridgeV3Routes(app);
  return app;
}

describe('Phase 30 bridge synchronization', () => {
  it('accepts a valid device-attested sync and returns the authoritative artifact manifest', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: attestation() });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(response.json().deviceId).toBe(DEVICE_ID);
    expect(response.json().artifact.revisionId).toBe('rev_2026_09_13_01');
    expect(response.json().pending[0].id).toBe('cmd-1');
    await app.close();
  });

  it('rejects missing attestation headers', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, error: 'identity_required' });
    await app.close();
  });

  it('rejects unknown devices and signatures over another URL', async () => {
    const app = await buildApp();
    const unknown = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: attestation('unknown-device') });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error).toBe('device_unknown');
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: { ...attestation(), 'x-signature': attestation(DEVICE_ID, '/wrong-url')['x-signature'] } });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error).toBe('attestation_invalid');
    await app.close();
  });

  it('rejects attestations outside the ±300 second freshness window', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/bridge/v3/sync', headers: attestation(DEVICE_ID, '/api/v1/bridge/v3/sync', Date.now() - 301_000) });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe('attestation_expired');
    await app.close();
  });

  it('accepts unified ACK with revisionId without a command id', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/bridge/v3/ack', headers: { ...attestation(DEVICE_ID, '/api/v1/bridge/v3/ack'), 'content-type': 'application/json' }, payload: { revisionId: 'rev_2026_09_13_01', ok: true } });
    expect(response.statusCode).toBe(200);
    expect(response.json().revisionId).toBe('rev_2026_09_13_01');
    await app.close();
  });

  it('persists command ACK when id is supplied', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/bridge/v3/ack', headers: { ...attestation(DEVICE_ID, '/api/v1/bridge/v3/ack'), 'content-type': 'application/json' }, payload: { id: 'cmd-1', revisionId: 'rev_2026_09_13_01', ok: true } });
    expect(response.statusCode).toBe(200);
    expect(mockedStore.acknowledgeBridgeCommand).toHaveBeenCalledWith(expect.objectContaining({ userId: DEVICE_ID, id: 'cmd-1', ok: true }));
    await app.close();
  });

  it('rejects ACK without id or revisionId', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/bridge/v3/ack', headers: { ...attestation(DEVICE_ID, '/api/v1/bridge/v3/ack'), 'content-type': 'application/json' }, payload: { ok: true } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, error: 'invalid_payload' });
    await app.close();
  });

  it('verifies the exact canonical request string', () => {
    const headers = attestation();
    expect(verifyBridgeDeviceAttestation({ ...bridgeDeviceAttestationHeaders({ headers }), url: '/api/v1/bridge/v3/sync' }).ok).toBe(true);
  });
});
