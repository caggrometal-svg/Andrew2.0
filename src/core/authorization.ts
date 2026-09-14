import { assertPermission, type Permission, type PermissionState } from './permissions';

export interface AuthorizationDecision {
  allowed: boolean;
  permission: Permission;
  reason: string;
}

export function authorize(
  permission: Permission,
  state?: ReadonlyArray<PermissionState>,
): AuthorizationDecision {
  try {
    assertPermission(permission, state);
    return { allowed: true, permission, reason: 'Permission explicitly granted.' };
  } catch {
    return { allowed: false, permission, reason: `Permission denied: ${permission}` };
  }
}

export function requireAuthorization(
  permission: Permission,
  state?: ReadonlyArray<PermissionState>,
): void {
  assertPermission(permission, state);
}
