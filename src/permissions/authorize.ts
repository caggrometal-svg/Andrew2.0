import type { AutonomyLevel, Capability, PermissionGrant } from '../core/types';

export interface AuthorizationRequest {
  capability: Capability;
  autonomy: AutonomyLevel;
  permissions: PermissionGrant[];
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
}

/**
 * Authorization is deliberately monotonic: autonomy may accelerate an
 * already-granted capability, but it can never override an explicit denial.
 */
export function authorize(request: AuthorizationRequest): AuthorizationResult {
  const grant = request.permissions.find((item) => item.capability === request.capability);

  if (grant?.decision === 'deny') {
    return { allowed: false, reason: 'Capability explicitly denied.' };
  }

  if (grant?.decision === 'allow') {
    return { allowed: true, reason: `Capability granted at ${request.autonomy} autonomy.` };
  }

  return { allowed: false, reason: 'No explicit permission grant exists.' };
}

export function canExecute(request: AuthorizationRequest): boolean {
  return authorize(request).allowed;
}
