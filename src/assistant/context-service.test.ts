import { describe, expect, it } from 'vitest';
import type { AssistantContext, PermissionGrant } from '../core/types';
import { MemoryService } from '../memory/memory-service';
import { MemoryStore } from '../memory/memory-store';
import { LocalStorageProvider } from '../storage/storage-provider';
import { ContextService } from './context-service';

const project = {
  projectId: 'p1',
  name: 'Test',
  status: 'active' as const,
  autonomy: 'assisted' as const,
  updatedAt: '2026-09-12T00:00:00.000Z',
  metadata: {},
};

const memory = {
  id: 'm1',
  kind: 'fact' as const,
  content: 'Andrew remembers the project goal',
  source: 'user' as const,
  importance: 1,
  confidence: 1,
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  tags: ['project'],
  accessCount: 0,
};

function context(permissions: PermissionGrant[]): AssistantContext {
  return { project, permissions, recentActivity: [] };
}

describe('ContextService', () => {
  it('retrieves memory only with an explicit memory.read grant', () => {
    const service = new ContextService(new MemoryService(new MemoryStore(new LocalStorageProvider())));
    service['memory'].remember(memory);

    const result = service.build(context([{
      capability: 'memory.read',
      decision: 'allow',
      grantedAt: '2026-09-12T00:00:00.000Z',
    }]), 'project');

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]?.id).toBe('m1');
  });

  it('returns no memory when memory.read is denied', () => {
    const service = new ContextService(new MemoryService(new MemoryStore(new LocalStorageProvider())));
    service['memory'].remember(memory);

    const result = service.build(context([{
      capability: 'memory.read',
      decision: 'deny',
      grantedAt: '2026-09-12T00:00:00.000Z',
    }]), 'project');

    expect(result.memories).toEqual([]);
  });

  it('limits recent activity without mutating the source context', () => {
    const service = new ContextService(new MemoryService(new MemoryStore(new LocalStorageProvider())));
    const activities = Array.from({ length: 3 }, (_, index) => ({
      id: `a${index}`,
      timestamp: `2026-09-12T00:0${index}:00.000Z`,
      action: `action-${index}`,
      result: 'success' as const,
    }));

    const original = { ...context([]), recentActivity: activities };
    const result = service.build(original, 'missing', 2);

    expect(result.recentActivity.map((item) => item.id)).toEqual(['a1', 'a2']);
    expect(original.recentActivity).toHaveLength(3);
  });
});
