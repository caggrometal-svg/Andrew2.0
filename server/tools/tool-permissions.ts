import type { ToolDefinition } from './tool-types';
import type { ToolPermissionPolicy } from './tool-router';
import type { ToolCapability } from './tool-capabilities';

export interface CapabilityPermissionPolicy extends ToolPermissionPolicy {
  readonly capabilities: readonly ToolCapability[];
}

export function createPermissionPolicy(tools: readonly ToolDefinition[]): CapabilityPermissionPolicy {
  const capabilities = Object.freeze(
    tools.map((tool) => tool.capability).filter((capability): capability is ToolCapability => typeof capability === 'string'),
  );
  return Object.freeze({
    allowed: Object.freeze(tools.map((tool) => tool.name)),
    capabilities,
    allowWrite: false,
    allowExternal: false,
  });
}

export function canUseCapability(policy: CapabilityPermissionPolicy, capability: ToolCapability): boolean {
  return policy.capabilities.includes(capability);
}
