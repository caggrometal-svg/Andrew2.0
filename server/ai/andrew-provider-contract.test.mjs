import { describe, expect, it } from 'vitest';
import {
  ANDREW_PROVIDER_CONTRACT_VERSION,
  ANDREW_USAGE_POLICY,
  createAvailabilityContract,
  createProviderRequest,
  createProviderResponse,
} from './andrew-provider-contract.mjs';

describe('AndrewProviderContract', () => {
  it('normalizes a model-agnostic request without changing message semantics', () => {
    const input = [
      { role: 'system', content: 'Andrew 3.0' },
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Hola.' },
    ];
    const request = createProviderRequest({ input, memory: ['fact'], metadata: { conversationId: 'c1' } });
    expect(request.contractVersion).toBe(ANDREW_PROVIDER_CONTRACT_VERSION);
    expect(request.input).toEqual(input);
    expect(request.memory).toEqual(['fact']);
    expect(request.metadata).toEqual({ conversationId: 'c1' });
  });

  it('returns the same universal output shape for any provider/model', () => {
    const response = createProviderResponse({ text: 'respuesta', provider: 'local-edge', model: 'llama', requestId: 'r1' });
    expect(response.contractVersion).toBe(ANDREW_PROVIDER_CONTRACT_VERSION);
    expect(response.text).toBe('respuesta');
    expect(response.provider).toBe('local-edge');
    expect(response.model).toBe('llama');
  });

  it('declares unlimited application usage without claiming unlimited provider capacity', () => {
    const availability = createAvailabilityContract({ providerCount: 4, tierStates: { tier1: 'ready', tier4: 'standby' } });
    expect(availability.usagePolicy).toBe(ANDREW_USAGE_POLICY);
    expect(availability.appEnforcedQuota).toBe(false);
    expect(availability.providerCount).toBe(4);
  });
});
