import type { PermissionContext, PermissionDecision, PermissionGate, ToolDefinition, ToolIntent } from './tool-types';

export class StrictPermissionGate implements PermissionGate {
  evaluate<TArgs>(
    intent: ToolIntent<TArgs>,
    tool: ToolDefinition<TArgs>,
    context: PermissionContext,
  ): PermissionDecision {
    if (!context.authenticated) return { allowed: false, reason: 'authentication_required' };
    if (intent.risk !== tool.risk) return { allowed: false, reason: 'risk_mismatch' };
    if (!context.allowedRisks.has(tool.risk)) return { allowed: false, reason: 'risk_not_granted' };
    for (const capability of tool.capabilities) {
      if (!context.capabilities.has(capability)) return { allowed: false, reason: `capability_not_granted:${capability}` };
    }
    if (tool.risk !== 'read' && !context.userConfirmed) return { allowed: false, reason: 'user_confirmation_required' };
    return { allowed: true, reason: 'allowed' };
  }
}
