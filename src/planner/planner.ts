import type { AnalysisRequest, PlannedAction } from '../core/types';
import { authorize, type AuthorizationRequest } from '../permissions/authorize';

export interface PlanContext {
  autonomy: AuthorizationRequest['autonomy'];
  permissions: AuthorizationRequest['permissions'];
}

/**
 * Deterministic planner: it only produces executable actions when their
 * capabilities are explicitly authorized. Planning never grants permission.
 */
export function planAnalysis(request: AnalysisRequest, context: PlanContext): PlannedAction[] {
  const capability = 'analysis.run' as const;
  const authorization = authorize({
    capability,
    autonomy: context.autonomy,
    permissions: context.permissions,
  });

  if (!authorization.allowed) return [];

  return [{
    id: crypto.randomUUID(),
    action: `analysis:${request.domain}:${request.horizon}`,
    capability,
    requiresConfirmation: context.autonomy !== 'autonomous',
  }];
}
