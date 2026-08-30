import { describe, expect, it } from 'vitest';
import { IAC33Runtime } from '../assistant/iac33-runtime';

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
    expect(runtime.activity.all()[0].result).toBe('denied');
  });

  it('persists projects and activity through the storage provider', () => {
    const runtime = new IAC33Runtime();
    runtime.projects.create('persisted', 'Persisted Project');
    runtime.persist();

    expect(runtime.projectStore.load().some((p) => p.projectId === 'persisted')).toBe(true);
    expect(runtime.activityStore.load().all()).toHaveLength(0);
  });
});
