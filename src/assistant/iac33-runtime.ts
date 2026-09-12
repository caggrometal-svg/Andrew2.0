import type { ActivityRecord, AssistantContext, PlannedAction } from '../core/types';
import type { RuntimeCommand, RuntimeResult } from '../core/runtime-contract';
import { executeCommand } from './runtime-executor';
import { authorize } from '../permissions/authorize';
import { ActivityLog } from '../activity/activity-log';
import { PersistentActivityStore } from '../storage/activity-store';
import { LocalStorageProvider, type StorageProvider } from '../storage/storage-provider';
import { ProjectManager } from '../projects/project-manager';
import { PersistentProjectStore } from '../state/persistent-project-store';
import { MemoryStore } from '../memory/memory-store';
import { MemoryService } from '../memory/memory-service';
import { LearningLoop } from '../memory/learning-loop';

export class IAC33Runtime {
  readonly projects = new ProjectManager();
  readonly activity = new ActivityLog();
  readonly activityStore: PersistentActivityStore;
  readonly projectStore: PersistentProjectStore;
  readonly memory: MemoryService;
  readonly learning: LearningLoop;

  constructor(readonly storage: StorageProvider = new LocalStorageProvider()) {
    this.activityStore = new PersistentActivityStore(storage);
    this.projectStore = new PersistentProjectStore(storage);
    this.memory = new MemoryService(new MemoryStore(storage));
    this.learning = new LearningLoop(this.memory);
  }

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

  execute<TInput, TOutput>(
    context: AssistantContext,
    command: RuntimeCommand<TInput>,
    handler: (input: TInput) => TOutput | Promise<TOutput>,
  ): Promise<RuntimeResult<TOutput>> {
    return executeCommand(context, command, handler);
  }

  learnFromActivity(record: ActivityRecord): void {
    this.learning.learnFromActivity(record);
  }

  persist(): void {
    this.projectStore.save(this.projects.list());
    this.activityStore.save(this.activity);
  }

  private record(record: ActivityRecord): void {
    this.activity.append(record);
    this.activityStore.save(this.activity);
    this.learning.learnFromActivity(record);
  }
}
