# Phase 25 — Bridge Cryptographic Authentication

## Protocol

The client installation is identified by `X-Andrew-User-Id`, which is only a public-key selector. It is not a credential.

Each protected request signs this exact UTF-8 canonical message:

```text
<userId>\n<timestampMs>\n<nonce>\n<rawRequestBody>
```

Headers:

- `X-Andrew-User-Id`
- `X-Andrew-Timestamp`
- `X-Andrew-Nonce`
- `X-Andrew-Signature` (base64url)

The server rejects missing/invalid headers, timestamps outside ±300 seconds, reused nonces, unknown identities, and invalid signatures with HTTP 401.

## Key lifecycle

Android must generate an Ed25519 key pair in Android Keystore where the private key remains non-exportable. The public key is registered during authenticated pairing/bootstrap and stored server-side against the installation identity.

No static token, private key, API key, or shared secret may be embedded in the APK.

## Replay protection

The server keeps `(userId, nonce)` entries until the authentication window expires. A nonce is consumed only after signature verification succeeds. A valid request therefore cannot be accepted twice within the window.

## Current implementation boundary

`server/bridge/bridge-auth.mjs` implements the cryptographic verification primitive and replay cache. `tests/phase25-bridge-security-v2.test.mjs` covers the five required primitive scenarios.

Before Phase 25 can be certified, the verifier must be wired into the actual Fastify bridge/chat routes, public-key registration must be implemented, and the Android KeyStore signing interceptor must be connected end-to-end. The test runner must then execute the integrated HTTP tests against the real route stack.
