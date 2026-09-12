import { describe, expect, it } from 'vitest';
import { IAC33Runtime } from '../assistant/iac33-runtime';
import { LocalStorageProvider } from '../storage/storage-provider';

describe('IAC33Runtime integration', () => {
  it('keeps denied actions out of execution while auditing the decision', () => {
    const runtime = new IAC33Runtime();
    const project = runtime.projects.create('test-project', 'Test Project');
    const context = runtime.context(project.projectId, []);
    const allowed = runtime.authorizeAction(context, {
      id: 'network-read-denied',
      action: 'network.read',
      capability: 'network.read',
      requiresConfirmation: false,
    });

    expect(allowed).toBe(false);
    expect(runtime.activity.all()).toHaveLength(1);
    expect(runtime.activity.all()[0]?.result).toBe('denied');
  });

  it('shares one injected storage boundary across runtime stores', () => {
    const storage = new LocalStorageProvider();
    const runtime = new IAC33Runtime(storage);

    expect(runtime.storage).toBe(storage);
    runtime.projects.create('shared-storage', 'Shared Storage');
    runtime.persist();

    expect(runtime.projectStore.load().some((p) => p.projectId === 'shared-storage')).toBe(true);
  });

  it('executes an authorized command through the runtime contract', async () => {
    const runtime = new IAC33Runtime();
    const project = runtime.projects.create('execution', 'Execution');
    const context = runtime.context(project.projectId, [{
      capability: 'state.read',
      decision: 'allow',
      grantedAt: '2026-09-12T00:00:00.000Z',
    }]);

    const result = await runtime.execute(
      context,
      {
        id: 'state-read',
        action: 'state.read',
        capability: 'state.read',
        input: { key: 'status' },
        requestedAt: '2026-09-12T00:00:00.000Z',
      },
      (input) => input,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.output).toEqual({ key: 'status' });
  });

  it('does not execute a denied command', async () => {
    const runtime = new IAC33Runtime();
    const project = runtime.projects.create('denied-execution', 'Denied Execution');
    const context = runtime.context(project.projectId, []);
    let invoked = false;

    const result = await runtime.execute(
      context,
      {
        id: 'network-write',
        action: 'network.write',
        capability: 'network.write',
        input: null,
        requestedAt: '2026-09-12T00:00:00.000Z',
      },
      () => {
        invoked = true;
        return true;
      },
    );

    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PERMISSION_DENIED');
  });

  it('persists projects and activity through the storage provider', () => {
    const runtime = new IAC33Runtime();
    runtime.projects.create('persisted', 'Persisted Project');
    runtime.persist();

    expect(runtime.projectStore.load().some((p) => p.projectId === 'persisted')).toBe(true);
    expect(runtime.activityStore.load().all()).toHaveLength(0);
  });
});
