import { describe, expect, it, vi } from 'vitest';
import { FetchNetworkAdapter, NetworkAccessDeniedError } from './network-adapter';

const okResponse = () => new Response('ok', { status: 200 });

describe('FetchNetworkAdapter', () => {
  it('allows policy-enabled public web requests', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    const adapter = new FetchNetworkAdapter({ fetchImpl, now: () => 1000 });

    const result = await adapter.request({ capability: 'public-web', input: 'https://example.com' });

    expect(result.response.status).toBe(200);
    expect(result.elapsedMs).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects restricted capabilities before network access', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new FetchNetworkAdapter({ fetchImpl });

    await expect(adapter.request({ capability: 'restricted-network', input: 'https://example.com' }))
      .rejects.toBeInstanceOf(NetworkAccessDeniedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects satellite control before network access', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new FetchNetworkAdapter({ fetchImpl });

    await expect(adapter.request({ capability: 'satellite-control', input: 'https://example.com' }))
      .rejects.toMatchObject({ code: 'NETWORK_ACCESS_DENIED', capability: 'satellite-control' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('aborts requests that exceed the configured timeout', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const adapter = new FetchNetworkAdapter({ fetchImpl, defaultTimeoutMs: 1 });

    await expect(adapter.request({ capability: 'public-web', input: 'https://example.com' }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});
