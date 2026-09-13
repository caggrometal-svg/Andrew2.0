export type Permission =
  | 'internet.search'
  | 'deepweb.connect'
  | 'satellite.read'
  | 'seismic.read'
  | 'weather.read'
  | 'memory.read'
  | 'memory.write'
  | 'state.read'
  | 'state.write'
  | 'network.read'
  | 'network.write'
  | 'analysis.run'
  | 'project.write'
  | 'content.generate';

export interface PermissionState {
  permission: Permission;
  granted: boolean;
  reason: string;
}

const PERMISSIONS: ReadonlySet<Permission> = new Set([
  'internet.search', 'deepweb.connect', 'satellite.read', 'seismic.read', 'weather.read',
  'memory.read', 'memory.write', 'state.read', 'state.write', 'network.read',
  'network.write', 'analysis.run', 'project.write', 'content.generate',
]);

export const defaultPermissions: ReadonlyArray<PermissionState> = Object.freeze([
  { permission: 'internet.search', granted: true, reason: 'Fuentes públicas' },
  { permission: 'deepweb.connect', granted: false, reason: 'Requiere conector y autorización explícita' },
  { permission: 'satellite.read', granted: false, reason: 'Requiere servicio/API autorizado' },
  { permission: 'seismic.read', granted: true, reason: 'Módulo preparado para datos verificables' },
  { permission: 'weather.read', granted: true, reason: 'Módulo preparado para datos verificables' },
  { permission: 'memory.read', granted: true, reason: 'Lectura de memoria local' },
  { permission: 'memory.write', granted: true, reason: 'Memoria local del navegador' },
  { permission: 'state.read', granted: true, reason: 'Lectura del estado local' },
  { permission: 'state.write', granted: false, reason: 'Requiere autorización explícita' },
  { permission: 'network.read', granted: true, reason: 'Red pública autorizada' },
  { permission: 'network.write', granted: false, reason: 'Requiere autorización explícita' },
  { permission: 'analysis.run', granted: true, reason: 'Núcleo de análisis local' },
  { permission: 'project.write', granted: false, reason: 'Requiere autorización explícita' },
  { permission: 'content.generate', granted: false, reason: 'Requiere autorización explícita' },
]);

export function isAllowed(
  permission: Permission,
  state: ReadonlyArray<PermissionState> = [],
): boolean {
  const matches = state.filter((entry) => entry.permission === permission);
  if (matches.length === 0) return false;
  if (matches.some((entry) => !entry.granted)) return false;
  return true;
}

export function assertPermission(
  permission: Permission,
  state: ReadonlyArray<PermissionState> = [],
): void {
  if (!isAllowed(permission, state)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

export function validatePermissionState(
  state: ReadonlyArray<PermissionState>,
): void {
  const seen = new Set<Permission>();
  for (const entry of state) {
    if (!entry || typeof entry.permission !== 'string' || !PERMISSIONS.has(entry.permission as Permission) || typeof entry.granted !== 'boolean') {
      throw new Error('Invalid permission state');
    }
    if (seen.has(entry.permission)) {
      throw new Error(`Duplicate permission: ${entry.permission}`);
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) throw new Error(`Missing permission reason: ${entry.permission}`);
    seen.add(entry.permission);
  }
}