import { describe, expect, it } from 'vitest';
import { assertCapability, canUseCapability } from '../server/runtime/capability-gate';

describe('Phase 11 autonomous production runtime', () => {
  it('denies capabilities that are not explicitly allowed', () => {
    expect(canUseCapability('system.status', [], false)).toBe(false);
    expect(canUseCapability('system.status', ['system.status'], false)).toBe(true);
  });

  it('requires explicit authorization for critical execution', () => {
    expect(() => assertCapability({ capability: 'agent.execute', authorized: true })).toThrow('CAPABILITY_CRITICAL_AUTH_REQUIRED');
    expect(() => assertCapability({ capability: 'agent.execute', authorized: true, critical: true })).not.toThrow();
    expect(() => assertCapability({ capability: 'system.status', authorized: false })).toThrow('CAPABILITY_DENIED');
  });

  it('keeps runtime capabilities finite and explicit', () => {
    const allowed = ['memory.read', 'memory.write', 'system.status', 'system.diagnostics', 'media.inspect', 'media.process', 'agent.plan', 'agent.execute', 'agent.verify'] as const;
    expect(allowed).toHaveLength(9);
    expect(canUseCapability('agent.execute', allowed, false)).toBe(false);
    expect(canUseCapability('agent.execute', allowed, true)).toBe(true);
  });
});
