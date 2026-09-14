import { authorize, requireAuthorization } from '../core/authorization';
import { validatePermissionState, type Permission, type PermissionState } from '../core/permissions';
import { LocalStorageProvider, type StorageProvider } from '../storage/storage-provider';

export type Capability = Permission;
export type PermissionGrant = PermissionState;
export interface ProjectState { projectId: string; name: string; status: 'idle' | 'active' | 'paused' | 'completed' | 'error'; autonomy: 'restricted' | 'assisted' | 'autonomous'; updatedAt: string; }
export interface ActivityRecord { id: string; timestamp: string; action: string; capability: Capability; result: 'success' | 'denied' | 'error'; details: { projectId: string; reason: string }; }
export interface PlannedAction { id: string; action: string; capability: Capability; requiresConfirmation: boolean; confirmed?: boolean; }

const PROJECTS_KEY = 'iac33.projects.v1';
const ACTIVITY_KEY = 'iac33.activity.v1';
const MAX_ACTIVITY = 5000;
const MAX_ACTION_ID = 200;
const MAX_ACTION_TEXT = 500;

class ProjectStore {
  constructor(private readonly storage: StorageProvider) {}
  load(): ProjectState[] { const value = this.storage.get<unknown>(PROJECTS_KEY); return Array.isArray(value) ? value.filter(isProjectState).slice(0, 1000) : []; }
  save(projects: ProjectState[]): void { this.storage.set(PROJECTS_KEY, projects.slice(0, 1000)); }
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

  createProject(id: string, name: string, permissions?: ReadonlyArray<PermissionState>): ProjectState {
    requireAuthorization('project.write', permissions);
    if (!id.trim() || !name.trim()) throw new Error('Project id and name are required');
    if (id.length > 200 || name.length > 500) throw new Error('Project fields exceed maximum length');
    if (this.projects.has(id)) throw new Error(`Project already exists: ${id}`);
    const project: ProjectState = { projectId: id, name, status: 'idle', autonomy: 'restricted', updatedAt: new Date().toISOString() };
    this.projects.set(id, project);
    this.projectStore.save([...this.projects.values()]);
    return project;
  }

  getProject(id: string): ProjectState | undefined { return this.projects.get(id); }

  authorizeAction(projectId: string, permissions: ReadonlyArray<PermissionState>, action: PlannedAction): boolean {
    if (!this.getProject(projectId)) throw new Error(`Project not found: ${projectId}`);
    validatePermissionState(permissions);
    if (!isValidPlannedAction(action)) throw new Error('Invalid planned action');
    const decision = authorize(action.capability, permissions);
    const confirmationMissing = action.requiresConfirmation && action.confirmed !== true;
    const allowed = decision.allowed && !confirmationMissing;
    const reason = !decision.allowed ? decision.reason : confirmationMissing ? 'Explicit confirmation required.' : 'Permission explicitly granted.';
    this.activities.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: action.action, capability: action.capability, result: allowed ? 'success' : 'denied', details: { projectId, reason } });
    this.activityStore.save(this.activities);
    return allowed;
  }

  allActivity(): ActivityRecord[] { return this.activities.map((record) => ({ ...record, details: { ...record.details } })); }

  persist(permissions?: ReadonlyArray<PermissionState>): void {
    requireAuthorization('project.write', permissions);
    this.projectStore.save([...this.projects.values()]);
    this.activityStore.save(this.activities);
  }
}

function isProjectState(value: unknown): value is ProjectState {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ProjectState>;
  return typeof item.projectId === 'string' && item.projectId.trim().length > 0 && item.projectId.length <= 200
    && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 500
    && ['idle', 'active', 'paused', 'completed', 'error'].includes(item.status ?? '')
    && ['restricted', 'assisted', 'autonomous'].includes(item.autonomy ?? '')
    && typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt));
}

function isActivityRecord(value: unknown): value is ActivityRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ActivityRecord>;
  return typeof item.id === 'string' && item.id.trim().length > 0 && item.id.length <= MAX_ACTION_ID
    && typeof item.timestamp === 'string' && !Number.isNaN(Date.parse(item.timestamp))
    && typeof item.action === 'string' && item.action.trim().length > 0 && item.action.length <= MAX_ACTION_TEXT
    && typeof item.capability === 'string'
    && typeof item.result === 'string' && ['success', 'denied', 'error'].includes(item.result)
    && !!item.details && typeof item.details.projectId === 'string' && item.details.projectId.length <= 200
    && typeof item.details.reason === 'string' && item.details.reason.length <= 500;
}

function isValidPlannedAction(action: PlannedAction): boolean {
  return !!action
    && typeof action.id === 'string' && action.id.trim().length > 0 && action.id.length <= MAX_ACTION_ID
    && typeof action.action === 'string' && action.action.trim().length > 0 && action.action.length <= MAX_ACTION_TEXT
    && typeof action.capability === 'string'
    && typeof action.requiresConfirmation === 'boolean'
    && (action.confirmed === undefined || typeof action.confirmed === 'boolean');
}
