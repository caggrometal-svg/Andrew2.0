import crypto from 'node:crypto';
import { canonicalBridgeSignature } from '../server/bridge/bridge-auth.mjs';

const BASE_URL = (process.env.BASE_URL || 'https://andrew2-api.onrender.com').replace(/\/$/, '');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const PAIRING_CODE = (process.env.ANDREW_BRIDGE_PAIRING_CODE || process.env.ANDREW_BRIDGE_SECRET)?.trim();
const TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '45000', 10);
const RETRIES = Number.parseInt(process.env.SMOKE_RETRIES || '12', 10);
const RETRY_DELAY_MS = Number.parseInt(process.env.SMOKE_RETRY_DELAY_MS || '5000', 10);

function failGate(gate, message) {
  console.error(`GATE=${gate}`);
  console.error(`STATUS=FAIL`);
  throw new Error(message);
}

if (!PAIRING_CODE) {
  failGate('CI_CONFIG', 'ANDREW_BRIDGE_PAIRING_CODE or ANDREW_BRIDGE_SECRET is missing from the GitHub Actions environment.');
}
if (!Number.isSafeInteger(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
  failGate('SMOKE_CONFIG', 'SMOKE_TIMEOUT_MS must be a positive integer.');
}
if (!Number.isSafeInteger(RETRIES) || RETRIES <= 0) {
  failGate('SMOKE_CONFIG', 'SMOKE_RETRIES must be a positive integer.');
}
if (!Number.isSafeInteger(RETRY_DELAY_MS) || RETRY_DELAY_MS < 0) {
  failGate('SMOKE_CONFIG', 'SMOKE_RETRY_DELAY_MS must be a non-negative integer.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url, options, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    return { response, body, label };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

function securityHeaders({ userId, body }) {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const canonical = canonicalBridgeSignature({ userId, timestamp, nonce, body });
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64url');
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Andrew-User-Id': userId,
    'X-Andrew-Timestamp': String(timestamp),
    'X-Andrew-Nonce': nonce,
    'X-Andrew-Signature': signature,
    ...(ALLOWED_ORIGIN ? { Origin: ALLOWED_ORIGIN } : {}),
  };
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const runIdentity = process.env.GITHUB_RUN_ID || `${Date.now()}`;
const userId = `prod-qa-smoketest-${runIdentity}-${crypto.randomUUID().slice(0, 8)}`;
const conversationId = `phase1-qa-${runIdentity}`;
const message = 'QA_PRODUCTION_SMOKE_ANSWER_ONLY';

const pairingBody = JSON.stringify({ userId, publicKeyBase64, pairingCode: PAIRING_CODE });
const pairingHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  ...(ALLOWED_ORIGIN ? { Origin: ALLOWED_ORIGIN } : {}),
};

let pairing;
try {
  pairing = await requestJson(`${BASE_URL}/api/v1/bridge/pairing`, {
    method: 'POST',
    headers: pairingHeaders,
    body: pairingBody,
  }, 'bridge pairing');
} catch (error) {
  failGate('RENDER_PAIRING', error instanceof Error ? error.message : String(error));
}

if (pairing.response.status !== 201 || pairing.body?.ok !== true || pairing.body?.registered !== true) {
  failGate('RENDER_PAIRING', `bridge pairing failed: HTTP ${pairing.response.status} ${JSON.stringify(pairing.body)}`);
}
console.log('GATE=CI_CONFIG');
console.log('STATUS=PASS');
console.log('GATE=RENDER_PAIRING');
console.log('STATUS=PASS');

const chatBody = JSON.stringify({ message, conversationId });
const headers = securityHeaders({ userId, body: chatBody });

let lastFailure = null;
for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
  try {
    const result = await requestJson(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers,
      body: chatBody,
    }, 'production chat smoke');

    const { response, body } = result;
    console.log(`ATTEMPT=${attempt} HTTP=${response.status}`);
    console.log(JSON.stringify(body));

    if (response.status === 200 && body?.ok === true && typeof body.reply === 'string' && body.reply.length > 0 && typeof body.responseId === 'string' && body.responseId.length > 0) {
      console.log('GATE=PRODUCTION_CHAT');
      console.log('STATUS=PASS');
      console.log(`PRODUCTION_CHAT_SMOKE=GREEN provider=${String(body.provider || 'unknown')} responseId=${body.responseId}`);
      process.exit(0);
    }

    lastFailure = new Error(`unexpected response: HTTP ${response.status} ${JSON.stringify(body)}`);
    if (![502, 503, 504].includes(response.status)) break;
  } catch (error) {
    lastFailure = error instanceof Error ? error : new Error(String(error));
  }

  if (attempt < RETRIES) await sleep(RETRY_DELAY_MS);
}

failGate('PRODUCTION_CHAT', `PRODUCTION_CHAT_SMOKE_FAILED: ${lastFailure?.message || 'unknown failure'}`);
