import { createPublicKey, verify } from 'node:crypto';

const WINDOW_MS = 300_000;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function publicKeyRegistry() {
  const raw = (process.env.BRIDGE_V3_DEVICE_PUBLIC_KEYS || process.env.BRIDGE_DEVICE_PUBLIC_KEYS || '').trim();
  if (!raw) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('BRIDGE_V3_DEVICE_PUBLIC_KEYS must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('BRIDGE_V3_DEVICE_PUBLIC_KEYS must be an object');
  return new Map(Object.entries(parsed));
}

export function verifyBridgeDeviceAttestation({ deviceId, timestamp, signature, url, now = Date.now() }) {
  if (!DEVICE_ID_PATTERN.test(deviceId || '')) return { ok: false, error: 'identity_required' };
  if (!/^\d{10,13}$/.test(timestamp || '')) return { ok: false, error: 'attestation_invalid' };
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > WINDOW_MS) return { ok: false, error: 'attestation_expired' };
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return { ok: false, error: 'attestation_invalid' };

  const encodedKey = publicKeyRegistry().get(deviceId);
  if (typeof encodedKey !== 'string' || !encodedKey) return { ok: false, error: 'device_unknown' };

  let publicKey;
  try {
    publicKey = createPublicKey({ key: Buffer.from(encodedKey, 'base64'), format: 'der', type: 'spki' });
  } catch {
    return { ok: false, error: 'device_key_invalid' };
  }

  const canonical = `${deviceId}.${timestamp}.${url}`;
  let valid = false;
  try {
    valid = verify('sha256', Buffer.from(canonical, 'utf8'), { key: publicKey, dsaEncoding: 'der' }, Buffer.from(signature, 'base64'));
  } catch {
    valid = false;
  }
  return valid ? { ok: true, deviceId } : { ok: false, error: 'attestation_invalid' };
}

export function bridgeDeviceAttestationHeaders(request) {
  return {
    deviceId: request.headers['x-device-id'],
    timestamp: request.headers['x-timestamp'],
    signature: request.headers['x-signature'],
  };
}

export { WINDOW_MS, DEVICE_ID_PATTERN };
