import { describe, expect, it } from 'vitest';
import { IAC33Runtime } from '../assistant/iac33-runtime';
import { LocalStorageProvider } from '../storage/storage-provider';

describe('IAC33Runtime integration', () => {
  it('keeps denied actions out of execution while auditing the decision', () => {
    const runtime = new IAC33Runtime();
    runtime.createProject('test-project', 'Test Project');

    const allowed = runtime.authorizeAction('test-project', [], {
      id: 'network-read-denied',
      action: 'network.read',
      capability: 'network.read',
      requiresConfirmation: false,
    });

    expect(allowed).toBe(false);
    expect(runtime.allActivity()).toHaveLength(1);
    expect(runtime.allActivity()[0]?.result).toBe('denied');
  });

  it('allows only explicitly granted capabilities', () => {
    const runtime = new IAC33Runtime();
    runtime.createProject('allowed-project', 'Allowed Project');

    expect(
      runtime.authorizeAction(
        'allowed-project',
        [{ capability: 'project.write', decision: 'allow' }],
        {
          id: 'project-write',
          action: 'project.write',
          capability: 'project.write',
          requiresConfirmation: false,
        },
      ),
    ).toBe(true);
  });

  it('persists projects and activity through the storage provider', () => {
    const runtime = new IAC33Runtime();
    runtime.createProject('persisted', 'Persisted Project');
    runtime.authorizeAction('persisted', [], {
      id: 'analysis-denied',
      action: 'analysis.run',
      capability: 'analysis.run',
      requiresConfirmation: false,
    });
    runtime.persist();

    expect(runtime.projectStore.load().some((project) => project.projectId === 'persisted')).toBe(true);
    expect(runtime.activityStore.load()).toHaveLength(1);
  });

  it('provides a safe in-memory fallback when localStorage is unavailable', () => {
    const storage = new LocalStorageProvider();
    storage.set('phase4.fallback', { ok: true });
    expect(storage.get<{ ok: boolean }>('phase4.fallback')).toEqual({ ok: true });
    storage.remove('phase4.fallback');
    expect(storage.get('phase4.fallback')).toBeNull();
  });
});
