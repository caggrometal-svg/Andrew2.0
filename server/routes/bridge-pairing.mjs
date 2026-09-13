import { registerBridgePublicKey, initializeBridgeIdentityStore } from '../bridge/bridge-identity-store.mjs';
const USER_ID = /^[A-Za-z0-9._:-]{1,128}$/;
export async function registerBridgePairingRoute(app) {
  await initializeBridgeIdentityStore();
  app.post('/api/v1/bridge/pairing', async (request, reply) => {
    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
    const userId = typeof body.userId === 'string' && USER_ID.test(body.userId) ? body.userId : null;
    const publicKeyBase64 = typeof body.publicKeyBase64 === 'string' ? body.publicKeyBase64.trim() : '';
    const pairingCode = typeof body.pairingCode === 'string' ? body.pairingCode : '';
    const expectedCode = process.env.ANDREW_BRIDGE_PAIRING_CODE?.trim();
    if (!expectedCode || !pairingCode || pairingCode !== expectedCode) return reply.code(401).send({ ok: false, error: 'PAIRING_UNAUTHORIZED' });
    if (!userId || !publicKeyBase64) return reply.code(400).send({ ok: false, error: 'INVALID_PAIRING_PAYLOAD' });
    try {
      const registered = await registerBridgePublicKey({ userId, publicKeyBase64 });
      if (!registered) return reply.code(409).send({ ok: false, error: 'IDENTITY_ALREADY_REGISTERED' });
      return reply.code(201).send({ ok: true, userId, registered: true });
    } catch (error) {
      request.log.error({ error }, 'bridge pairing failed');
      return reply.code(400).send({ ok: false, error: 'INVALID_PUBLIC_KEY' });
    }
  });
}
