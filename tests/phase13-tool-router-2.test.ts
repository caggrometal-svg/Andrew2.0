import { afterEach, describe, expect, it } from 'vitest';
import { assertCapability, TOOL_CAPABILITIES } from '../server/tools/tool-capabilities';
import { createPermissionPolicy, canUseCapability } from '../server/tools/tool-permissions';
import { clearToolRegistry, registerTool } from '../server/tools/tool-registry';
import { routeTool } from '../server/tools/tool-router';
import type { ToolContext } from '../server/tools/tool-types';

const context: ToolContext = { userId: 'phase13-user', conversationId: 'phase13-session', requestId: 'phase13-request' };

afterEach(() => clearToolRegistry());

describe('Phase 13 Tool Router 2', () => {
  it('defines a finite explicit capability set', () => {
    expect(TOOL_CAPABILITIES).toEqual([
      'memory.read', 'memory.write', 'system.status', 'system.diagnostics',
      'media.inspect', 'media.process', 'agent.plan', 'agent.execute', 'agent.verify',
    ]);
    expect(() => assertCapability('system.status')).not.toThrow();
    expect(() => assertCapability('system.root')).toThrow('TOOL_CAPABILITY_UNKNOWN');
  });

  it('denies a tool when its capability is absent', async () => {
    registerTool({
      name: 'system.status', description: 'system status', risk: 'read', capability: 'system.status',
      validate: () => undefined, execute: async () => ({ ok: true, data: { status: 'ok' } }),
    });
    const policy = { allowed: ['system.status'], capabilities: ['memory.read'] as const };
    const result = await routeTool('system.status', {}, context, policy);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('CAPABILITY_DENIED');
    expect(result.retryable).toBe(false);
  });

  it('allows a tool only when its explicit capability is granted', async () => {
    registerTool({
      name: 'system.status', description: 'system status', risk: 'read', capability: 'system.status',
      validate: () => undefined, execute: async () => ({ ok: true, data: { status: 'ok' } }),
    });
    const policy = createPermissionPolicy([{ name: 'system.status', description: 'system status', risk: 'read', capability: 'system.status', validate: () => undefined, execute: async () => ({ ok: true }) }]);
    expect(canUseCapability(policy, 'system.status')).toBe(true);
    const result = await routeTool('system.status', {}, context, policy);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
  });
});
