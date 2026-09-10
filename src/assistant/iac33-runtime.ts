import { LocalStorageProvider, type StorageProvider } from '../storage/storage-provider';

export type Capability =
  | 'memory.read'
  | 'memory.write'
  | 'state.read'
  | 'state.write'
  | 'network.read'
  | 'network.write'
  | 'analysis.run'
  | 'project.write'
  | 'content.generate';

export interface PermissionGrant {
  capability: Capability;
  decision: 'allow' | 'deny';
}

export interface ProjectState {
  projectId: string;
  name: string;
  status: 'idle' | 'active' | 'paused' | 'completed' | 'error';
  autonomy: 'restricted' | 'assisted' | 'autonomous';
  updatedAt: string;
}

export interface ActivityRecord {
  id: string;
  timestamp: string;
  action: string;
  capability: Capability;
  result: 'success' | 'denied' | 'error';
  details: { projectId: string; reason: string };
}

export interface PlannedAction {
  id: string;
  action: string;
  capability: Capability;
  requiresConfirmation: boolean;
}

const PROJECTS_KEY = 'iac33.projects.v1';
const ACTIVITY_KEY = 'iac33.activity.v1';

class ProjectStore {
  constructor(private readonly storage: StorageProvider) {}

  load(): ProjectState[] {
    return this.storage.get<ProjectState[]>(PROJECTS_KEY) ?? [];
  }

  save(projects: ProjectState[]): void {
    this.storage.set(PROJECTS_KEY, projects);
  }
}

class ActivityStore {
  constructor(private readonly storage: StorageProvider) {}

  load(): ActivityRecord[] {
    return this.storage.get<ActivityRecord[]>(ACTIVITY_KEY) ?? [];
  }

  save(records: ActivityRecord[]): void {
    this.storage.set(ACTIVITY_KEY, records);
  }
}

export class IAC33Runtime {
  readonly storage = new LocalStorageProvider();
  readonly projectStore = new ProjectStore(this.storage);
  readonly activityStore = new ActivityStore(this.storage);
  private readonly projects = new Map<string, ProjectState>();
  private readonly activities: ActivityRecord[] = [];

  constructor() {
    this.restore();
  }

  restore(): void {
    this.activities.push(...this.activityStore.load());
    for (const project of this.projectStore.load()) this.projects.set(project.projectId, project);
  }

  createProject(id: string, name: string): ProjectState {
    if (this.projects.has(id)) throw new Error(`Project already exists: ${id}`);
    const project: ProjectState = {
      projectId: id,
      name,
      status: 'idle',
      autonomy: 'restricted',
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(id, project);
    return project;
  }

  getProject(id: string): ProjectState | undefined {
    return this.projects.get(id);
  }

  authorizeAction(projectId: string, permissions: PermissionGrant[], action: PlannedAction): boolean {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const grant = permissions.find((permission) => permission.capability === action.capability);
    const allowed = grant?.decision === 'allow';
    const reason = grant
      ? `Capability explicitly ${grant.decision === 'allow' ? 'allowed' : 'denied'}.`
      : 'No explicit permission grant exists.';

    this.activities.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: action.action,
      capability: action.capability,
      result: allowed ? 'success' : 'denied',
      details: { projectId, reason },
    });
    this.activityStore.save(this.activities);
    return allowed;
  }

  allActivity(): ActivityRecord[] {
    return this.activities.map((record) => ({ ...record, details: { ...record.details } }));
  }

  persist(): void {
    this.projectStore.save([...this.projects.values()]);
    this.activityStore.save(this.activities);
  }
}
