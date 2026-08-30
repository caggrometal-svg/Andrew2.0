import type { ActivityRecord, AssistantContext, PlannedAction } from '../core/types';
import { authorize } from '../permissions/authorize';
import { ActivityLog } from '../activity/activity-log';
import { PersistentActivityStore } from '../storage/activity-store';
import { LocalStorageProvider } from '../storage/storage-provider';
import { ProjectManager } from '../projects/project-manager';
import { PersistentProjectStore } from '../state/persistent-project-store';
import { MemoryStore } from '../memory/memory-store';
import { MemoryService } from '../memory/memory-service';

export class IAC33Runtime {
  readonly storage = new LocalStorageProvider();
  readonly projects = new ProjectManager();
  readonly activity = new ActivityLog();
  readonly activityStore = new PersistentActivityStore(this.storage);
  readonly projectStore = new PersistentProjectStore(this.storage);
  readonly memory = new MemoryService(new MemoryStore(this.storage));

  restore(): void {
    const storedActivity = this.activityStore.load();
    storedActivity.all().forEach((record) => this.activity.append(record));

    for (const project of this.projectStore.load()) {
      if (!this.projects.get(project.projectId)) {
        this.projects.create(project.projectId, project.name);
      }
      this.projects.update(project.projectId, project);
    }
  }

  context(projectId: string, permissions: AssistantContext['permissions']): AssistantContext {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    return { project, permissions, recentActivity: this.activity.forProject(projectId) };
  }

  authorizeAction(context: AssistantContext, action: PlannedAction): boolean {
    const result = authorize({
      capability: action.capability,
      autonomy: context.project.autonomy,
      permissions: context.permissions,
    });
    this.record({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: action.action,
      capability: action.capability,
      result: result.allowed ? 'success' : 'denied',
      details: { projectId: context.project.projectId, reason: result.reason },
    });
    return result.allowed;
  }

  persist(): void {
    this.projectStore.save(this.projects.list());
    this.activityStore.save(this.activity);
  }

  private record(record: ActivityRecord): void {
    this.activity.append(record);
    this.activityStore.save(this.activity);
  }
}
