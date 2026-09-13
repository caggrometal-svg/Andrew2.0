import { beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { canonicalBridgeSignature, resetBridgeAuthForTests, verifyBridgeSignature } from '../server/bridge/bridge-auth.mjs';

const userId = 'phase25-test-device';
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const wrong = crypto.generateKeyPairSync('ed25519').privateKey;
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

function signed({ key = privateKey, timestamp = Date.now(), nonce = crypto.randomUUID(), body = '{"message":"phase25"}' } = {}) {
  const data = canonicalBridgeSignature({ userId, timestamp, nonce, body });
  return {
    'x-andrew-user-id': userId,
    'x-andrew-timestamp': String(timestamp),
    'x-andrew-nonce': nonce,
    'x-andrew-signature': crypto.sign(null, Buffer.from(data), key).toString('base64url'),
    body,
  };
}

describe('Phase 25 bridge security v2', () => {
  beforeEach(() => resetBridgeAuthForTests());

  it('returns 401 for missing headers', () => {
    expect(verifyBridgeSignature({ headers: {}, publicKey: publicPem }).status).toBe(401);
  });

  it('returns 401 for an invalid signature', () => {
    const headers = signed({ key: wrong });
    expect(verifyBridgeSignature({ headers, body: headers.body, publicKey: publicPem }).status).toBe(401);
  });

  it('rejects a replayed nonce', () => {
    const headers = signed();
    expect(verifyBridgeSignature({ headers, body: headers.body, publicKey: publicPem }).ok).toBe(true);
    const replay = verifyBridgeSignature({ headers, body: headers.body, publicKey: publicPem });
    expect(replay.status).toBe(401);
    expect(replay.error).toBe('bridge_auth_replay');
  });

  it('rejects an expired timestamp', () => {
    const headers = signed({ timestamp: Date.now() - 301000 });
    const result = verifyBridgeSignature({ headers, body: headers.body, publicKey: publicPem });
    expect(result.status).toBe(401);
    expect(result.error).toBe('bridge_auth_expired');
  });

  it('accepts a valid signature', () => {
    const headers = signed();
    const result = verifyBridgeSignature({ headers, body: headers.body, publicKey: publicPem });
    expect(result.ok).toBe(true);
    expect(result.userId).toBe(userId);
  });
});
