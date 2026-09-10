import { describe, expect, it } from 'vitest';
import { applySecurityHeaders, createReadiness } from '../server/hardening.mjs';

describe('Phase 7 hardening', () => {
  it('defines the required security headers', () => {
    const headers = {};
    applySecurityHeaders({ header(name, value) { headers[name] = value; } });
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
  });

  it('returns 503 until the runtime is ready', async () => {
    let response;
    const handler = createReadiness({ isReady: () => false });
    await handler({}, { code(value) { response = value; return this; }, send(value) { response = { code: response, body: value }; return value; }, header() {} });
    expect(response.code).toBe(503);
    expect(response.body.ok).toBe(false);
  });

  it('returns 200 when the runtime is ready', async () => {
    let status = 0;
    let body;
    const handler = createReadiness({ isReady: () => true });
    await handler({}, { code(value) { status = value; return this; }, send(value) { body = value; return value; }, header() {} });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
