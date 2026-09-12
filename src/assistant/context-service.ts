import type { AssistantContext, ActivityRecord } from '../core/types';
import type { MemoryItem } from '../memory/memory-types';
import { authorize } from '../permissions/authorize';
import { MemoryService } from '../memory/memory-service';

export interface RetrievedAssistantContext extends AssistantContext {
  memories: MemoryItem[];
}

export class ContextService {
  constructor(private readonly memory: MemoryService) {}

  build(context: AssistantContext, query: string, activityLimit = 20): RetrievedAssistantContext {
    const authorization = authorize({
      capability: 'memory.read',
      autonomy: context.project.autonomy,
      permissions: context.permissions,
    });

    const recentActivity: ActivityRecord[] = context.recentActivity.slice(-activityLimit);
    const memories = authorization.allowed ? this.memory.recall(query) : [];

    return { ...context, recentActivity, memories };
  }
}
