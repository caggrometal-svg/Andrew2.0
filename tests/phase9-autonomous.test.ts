import { describe, expect, it, vi } from 'vitest';
import { InMemoryPhase9StateStore, createRunState, runPhase9 } from '../server/agent/phase9-runtime';
import type { Phase9AuditEvent, Phase9AuditSink, Phase9ExecutionState } from '../server/agent/phase9-types';

const state = (): Phase9ExecutionState => createRunState({ runId: 'run-1', requestId: 'req-1', userId: 'user-1', sessionId: 'session-1', steps: [{ id: 's1', toolName: 'memory.read', toolInput: { key: 'name' } }, { id: 's2', toolName: 'memory.write', toolInput: { key: 'seen', value: true } }], maxIterations: 4, deadlineAt: Date.now() + 10000, resourceUnits: 4, remainingUnits: 4 });

function audit(events: Phase9AuditEvent[]): Phase9AuditSink { return { append: async event => { events.push(event); } }; }

describe('Phase 9 autonomous runtime', () => {
  it('executes multiple steps through strict phases and audits them', async () => {
    const store = new InMemoryPhase9StateStore(); const events: Phase9AuditEvent[] = [];
    const result = await runPhase9(state(), { store, audit: audit(events), authorize: { authorize: vi.fn(async () => true) }, execute: { execute: vi.fn(async step => ({ ok: true, data: { step: step.id } })) } }, { now: (() => { let n = 1000; return () => ++n; })() });
    expect(result.phase).toBe('completed'); expect(result.currentStep).toBe(2); expect(events.length).toBe(3);
    expect(events.map(event => event.phase)).toEqual(['verifying', 'verifying', 'verifying']);
  });

  it('fails closed when capability authorization is denied', async () => {
    const store = new InMemoryPhase9StateStore();
    const result = await runPhase9(state(), { store, audit: audit([]), authorize: { authorize: async () => false }, execute: { execute: async () => ({ ok: true, data: true }) } });
    expect(result.phase).toBe('failed'); expect(result.error).toBe('CAPABILITY_DENIED:memory.read');
  });

  it('enforces iteration and resource limits', async () => {
    const store = new InMemoryPhase9StateStore();
    const result = await runPhase9(state(), { store, audit: audit([]), authorize: { authorize: async () => true }, execute: { execute: async () => ({ ok: true, data: true }) } }, { maxIterations: 1, resourceUnits: 1 });
    expect(result.phase).toBe('failed'); expect(result.error).toBe('PHASE9_RESOURCE_LIMIT');
  });
});
