import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  clearBridgeAttestationReplayCache,
  verifyBridgeDeviceAttestation,
} from './bridge-v3-device.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const deviceId = 'test-device';
const timestamp = String(Date.now());
const url = '/bridge/v3/command';
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function makeSignature(ts = timestamp, targetUrl = url) {
  return sign('sha256', Buffer.from(`${deviceId}.${ts}.${targetUrl}`, 'utf8'), privateKey).toString('base64');
}

test.afterEach(() => {
  clearBridgeAttestationReplayCache();
  delete process.env.BRIDGE_DEVICE_PUBLIC_KEYS;
});

test('accepts a valid attestation once and rejects its replay', () => {
  process.env.BRIDGE_DEVICE_PUBLIC_KEYS = JSON.stringify({ [deviceId]: publicKeyDer });
  const signature = makeSignature();
  const input = { deviceId, timestamp, signature, url, now: Number(timestamp) };

  assert.deepEqual(verifyBridgeDeviceAttestation(input), { ok: true, deviceId });
  assert.deepEqual(verifyBridgeDeviceAttestation(input), { ok: false, error: 'attestation_replay' });
});

test('rejects malformed URL input before cryptographic verification', () => {
  process.env.BRIDGE_DEVICE_PUBLIC_KEYS = JSON.stringify({ [deviceId]: publicKeyDer });
  const signature = makeSignature();
  const result = verifyBridgeDeviceAttestation({
    deviceId,
    timestamp,
    signature,
    url: `/bridge/${'x'.repeat(2048)}`,
    now: Number(timestamp),
  });
  assert.deepEqual(result, { ok: false, error: 'attestation_invalid' });
});
