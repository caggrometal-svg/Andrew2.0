import { describe, expect, it } from 'vitest';
import { IAC33Runtime } from '../assistant/iac33-runtime';
import { LocalStorageProvider } from '../storage/storage-provider';

const projectWrite = [{ permission: 'project.write' as const, granted: true, reason: 'test' }];
const analysisRead = [{ permission: 'analysis.run' as const, granted: true, reason: 'test' }];

describe('IAC33Runtime integration', () => {
  it('denies project mutation without explicit core authorization', () => {
    const runtime = new IAC33Runtime();
    expect(() => runtime.createProject('test-project', 'Test Project')).toThrow('Permission denied: project.write');
  });

  it('keeps denied actions out of execution while auditing the decision', () => {
    const runtime = new IAC33Runtime();
    runtime.createProject('test-project', 'Test Project', projectWrite);

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

  it('allows only explicitly granted capabilities through the core authority', () => {
    const runtime = new IAC33Runtime();
    runtime.createProject('allowed-project', 'Allowed Project', projectWrite);

    expect(
      runtime.authorizeAction(
        'allowed-project',
        projectWrite,
        {
          id: 'project-write',
          action: 'project.write',
          capability: 'project.write',
          requiresConfirmation: false,
        },
      ),
    ).toBe(true);
  });

  it('requires confirmation in addition to explicit authorization', () => {
    const runtime = new IAC33Runtime();
    runtime.createProject('confirmed-project', 'Confirmed Project', projectWrite);
    expect(runtime.authorizeAction('confirmed-project', analysisRead, {
      id: 'analysis', action: 'analysis.run', capability: 'analysis.run', requiresConfirmation: true,
    })).toBe(false);
    expect(runtime.authorizeAction('confirmed-project', analysisRead, {
      id: 'analysis-confirmed', action: 'analysis.run', capability: 'analysis.run', requiresConfirmation: true, confirmed: true,
    })).toBe(true);
  });

  it('persists projects and activity only with explicit project authorization', () => {
    const runtime = new IAC33Runtime();
    runtime.createProject('persisted', 'Persisted Project', projectWrite);
    runtime.authorizeAction('persisted', [], {
      id: 'analysis-denied',
      action: 'analysis.run',
      capability: 'analysis.run',
      requiresConfirmation: false,
    });
    expect(() => runtime.persist()).toThrow('Permission denied: project.write');
    runtime.persist(projectWrite);

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
