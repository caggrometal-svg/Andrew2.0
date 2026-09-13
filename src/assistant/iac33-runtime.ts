import { LocalStorageProvider, type StorageProvider } from '../storage/storage-provider';

export type Capability =
  | 'memory.read' | 'memory.write' | 'state.read' | 'state.write'
  | 'network.read' | 'network.write' | 'analysis.run' | 'project.write' | 'content.generate';

export interface PermissionGrant { capability: Capability; decision: 'allow' | 'deny'; }
export interface ProjectState { projectId: string; name: string; status: 'idle' | 'active' | 'paused' | 'completed' | 'error'; autonomy: 'restricted' | 'assisted' | 'autonomous'; updatedAt: string; }
export interface ActivityRecord { id: string; timestamp: string; action: string; capability: Capability; result: 'success' | 'denied' | 'error'; details: { projectId: string; reason: string }; }
export interface PlannedAction { id: string; action: string; capability: Capability; requiresConfirmation: boolean; confirmed?: boolean; }

const PROJECTS_KEY = 'iac33.projects.v1';
const ACTIVITY_KEY = 'iac33.activity.v1';
const MAX_ACTIVITY = 5000;
const CAPABILITIES: ReadonlySet<Capability> = new Set([
  'memory.read', 'memory.write', 'state.read', 'state.write', 'network.read',
  'network.write', 'analysis.run', 'project.write', 'content.generate',
]);

class ProjectStore {
  constructor(private readonly storage: StorageProvider) {}
  load(): ProjectState[] { const value = this.storage.get<unknown>(PROJECTS_KEY); return Array.isArray(value) ? value.filter(isProjectState) : []; }
  save(projects: ProjectState[]): void { this.storage.set(PROJECTS_KEY, projects); }
}

class ActivityStore {
  constructor(private readonly storage: StorageProvider) {}
  load(): ActivityRecord[] { const value = this.storage.get<unknown>(ACTIVITY_KEY); return Array.isArray(value) ? value.filter(isActivityRecord).slice(-MAX_ACTIVITY) : []; }
  save(records: ActivityRecord[]): void { this.storage.set(ACTIVITY_KEY, records.slice(-MAX_ACTIVITY)); }
}

export class IAC33Runtime {
  readonly storage = new LocalStorageProvider();
  readonly projectStore = new ProjectStore(this.storage);
  readonly activityStore = new ActivityStore(this.storage);
  private readonly projects = new Map<string, ProjectState>();
  private readonly activities: ActivityRecord[] = [];

  constructor() { this.restore(); }

  restore(): void {
    this.projects.clear();
    this.activities.length = 0;
    for (const project of this.projectStore.load()) this.projects.set(project.projectId, project);
    this.activities.push(...this.activityStore.load());
  }

  createProject(id: string, name: string): ProjectState {
    if (!id.trim() || !name.trim()) throw new Error('Project id and name are required');
    if (id.length > 200 || name.length > 500) throw new Error('Project fields exceed maximum length');
    if (this.projects.has(id)) throw new Error(`Project already exists: ${id}`);
    const project: ProjectState = { projectId: id, name, status: 'idle', autonomy: 'restricted', updatedAt: new Date().toISOString() };
    this.projects.set(id, project);
    this.projectStore.save([...this.projects.values()]);
    return project;
  }

  getProject(id: string): ProjectState | undefined { return this.projects.get(id); }

  authorizeAction(projectId: string, permissions: PermissionGrant[], action: PlannedAction): boolean {
    if (!this.getProject(projectId)) throw new Error(`Project not found: ${projectId}`);
    if (!action.id.trim() || !action.action.trim() || !CAPABILITIES.has(action.capability)) throw new Error('Invalid planned action');
    const grants = permissions.filter((permission) => permission.capability === action.capability);
    const explicitDeny = grants.some((permission) => permission.decision === 'deny');
    const explicitAllow = grants.some((permission) => permission.decision === 'allow');
    const confirmationMissing = action.requiresConfirmation && action.confirmed !== true;
    const allowed = explicitAllow && !explicitDeny && !confirmationMissing;
    const reason = explicitDeny ? 'Capability explicitly denied.' : confirmationMissing ? 'Explicit confirmation required.' : explicitAllow ? 'Capability explicitly allowed.' : 'No explicit permission grant exists.';
    this.activities.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: action.action, capability: action.capability, result: allowed ? 'success' : 'denied', details: { projectId, reason } });
    this.activityStore.save(this.activities);
    return allowed;
  }

  allActivity(): ActivityRecord[] { return this.activities.map((record) => ({ ...record, details: { ...record.details } })); }
  persist(): void { this.projectStore.save([...this.projects.values()]); this.activityStore.save(this.activities); }
}

function isProjectState(value: unknown): value is ProjectState {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ProjectState>;
  return typeof item.projectId === 'string' && typeof item.name === 'string'
    && ['idle', 'active', 'paused', 'completed', 'error'].includes(item.status ?? '')
    && ['restricted', 'assisted', 'autonomous'].includes(item.autonomy ?? '')
    && typeof item.updatedAt === 'string';
}

function isActivityRecord(value: unknown): value is ActivityRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ActivityRecord>;
  return typeof item.id === 'string' && typeof item.timestamp === 'string' && typeof item.action === 'string'
    && typeof item.capability === 'string' && CAPABILITIES.has(item.capability as Capability)
    && ['success', 'denied', 'error'].includes(item.result ?? '')
    && !!item.details && typeof item.details.projectId === 'string' && typeof item.details.reason === 'string';
}
