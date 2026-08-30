import type { AssistantContext, Capability, PlannedAction } from '../core/types';
import { authorize } from '../permissions/authorize';

export interface ExecutionDecision {
  action: PlannedAction;
  allowed: boolean;
  reason: string;
}

export function evaluateAction(context: AssistantContext, action: PlannedAction): ExecutionDecision {
  const result = authorize({
    capability: action.capability,
    autonomy: context.project.autonomy,
    permissions: context.permissions,
  });

  return { action, ...result };
}

export function evaluatePlan(
  context: AssistantContext,
  actions: PlannedAction[],
): ExecutionDecision[] {
  return actions.map((action) => evaluateAction(context, action));
}

export function hasCapability(context: AssistantContext, capability: Capability): boolean {
  return authorize({
    capability,
    autonomy: context.project.autonomy,
    permissions: context.permissions,
  }).allowed;
}
