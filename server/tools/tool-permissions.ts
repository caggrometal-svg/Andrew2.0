import type { ToolDefinition } from './tool-types';
import type { ToolPermissionPolicy } from './tool-router';

export function createPermissionPolicy(tools: readonly ToolDefinition[]): ToolPermissionPolicy {
  return Object.freeze({
    allowed: Object.freeze(tools.map((tool) => tool.name)),
    allowWrite: false,
    allowExternal: false,
  });
}
