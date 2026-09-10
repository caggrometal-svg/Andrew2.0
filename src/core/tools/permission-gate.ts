import type { PermissionContext, PermissionDecision, PermissionGate, ToolDefinition, ToolIntent } from './tool-types';

export class StrictPermissionGate implements PermissionGate {
  evaluate<TArgs>(intent: ToolIntent<TArgs>, tool: ToolDefinition<TArgs>, context: PermissionContext): PermissionDecision {
    if (!context.authenticated) return { allowed: false, reason: 'authentication_required' };
    if (!context.allowedRisks.has(intent.risk)) return { allowed: false, reason: 'risk_not_allowed' };
    if (intent.risk !== tool.risk) return { allowed: false, reason: 'risk_mismatch' };
    for (const capability of tool.capabilities) {
      if (!context.capabilities.has(capability)) return { allowed: false, reason: `capability_not_allowed:${capability}` };
    }
    if (intent.risk !== 'read' && !context.userConfirmed) return { allowed: false, reason: 'user_confirmation_required' };
    return { allowed: true, reason: 'allowed' };
  }
}
