import { describe, expect, it } from 'vitest';
import {
  ANDREW_PROVIDER_CONTRACT_VERSION,
  ANDREW_SERVICE_IDENTITY,
  ANDREW_USAGE_POLICY,
  createAvailabilityContract,
  createProviderRequest,
  createProviderResponse,
} from '../server/ai/andrew-provider-contract.mjs';

describe('AndrewProviderContract', () => {
  it('normalizes universal input without binding Andrew to a model', () => {
    const request = createProviderRequest({
      input: [
        { role: 'system', content: 'Andrew 3.0' },
        { role: 'user', content: 'hola' },
        { role: 'unsupported', content: 'ignored' },
      ],
      memory: ['persisted memory'],
    });

    expect(request.contractVersion).toBe(ANDREW_PROVIDER_CONTRACT_VERSION);
    expect(request.input).toHaveLength(2);
    expect(request.input[1]).toEqual({ role: 'user', content: 'hola' });
    expect(request.memory).toEqual(['persisted memory']);
  });

  it('produces a provider-agnostic response contract', () => {
    const response = createProviderResponse({ text: 'respuesta', provider: 'any-provider', model: 'any-model', latencyMs: 12 });
    expect(response).toMatchObject({
      contractVersion: ANDREW_PROVIDER_CONTRACT_VERSION,
      text: 'respuesta',
      provider: 'any-provider',
      model: 'any-model',
      latencyMs: 12,
    });
  });

  it('declares unlimited application policy without claiming unlimited upstream capacity', () => {
    const availability = createAvailabilityContract({ providerCount: 2, tierStates: { '1': { healthy: 2 } } });
    expect(availability).toMatchObject({
      serviceIdentity: ANDREW_SERVICE_IDENTITY,
      usagePolicy: ANDREW_USAGE_POLICY,
      appEnforcedQuota: false,
      providerCount: 2,
    });
  });

  it('rejects malformed provider output', () => {
    expect(() => createProviderResponse({ text: '', provider: 'provider' })).toThrow(TypeError);
    expect(() => createProviderResponse({ text: 'ok', provider: '' })).toThrow(TypeError);
  });
});
