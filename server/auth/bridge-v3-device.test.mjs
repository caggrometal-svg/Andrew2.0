import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  clearBridgeAttestationReplayCache,
  verifyBridgeDeviceAttestation,
} from './bridge-v3-device.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const deviceId = 'test-device';
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function makeInput(ts = String(Date.now()), targetUrl = '/api/v1/bridge/v3/commands') {
  const signature = sign('sha256', Buffer.from(`${deviceId}.${ts}.${targetUrl}`, 'utf8'), privateKey).toString('base64');
  return { deviceId, timestamp: ts, signature, url: targetUrl, now: Number(ts) };
}

test.beforeEach(() => {
  process.env.BRIDGE_V3_DEVICE_PUBLIC_KEYS = JSON.stringify({ [deviceId]: publicKeyDer });
  clearBridgeAttestationReplayCache();
});

test.afterEach(() => {
  clearBridgeAttestationReplayCache();
  delete process.env.BRIDGE_V3_DEVICE_PUBLIC_KEYS;
});

test('accepts a valid attestation once and rejects its replay', () => {
  const input = makeInput();
  assert.deepEqual(verifyBridgeDeviceAttestation(input), { ok: true, deviceId });
  assert.deepEqual(verifyBridgeDeviceAttestation(input), { ok: false, error: 'attestation_replay' });
});

test('rejects oversized or control-character URLs before cryptographic work', () => {
  const oversized = makeInput(String(Date.now()), `/bridge/${'x'.repeat(2048)}`);
  assert.deepEqual(verifyBridgeDeviceAttestation(oversized), { ok: false, error: 'attestation_invalid' });

  const control = makeInput(String(Date.now() + 1), '/bridge/ok\u0000');
  assert.deepEqual(verifyBridgeDeviceAttestation(control), { ok: false, error: 'attestation_invalid' });
});
