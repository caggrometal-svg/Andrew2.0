import { afterEach, describe, expect, it } from 'vitest';
import { clearToolRegistry, registerTool } from '../server/tools/tool-registry.mjs';
import { routeTool } from '../server/tools/tool-router.mjs';
import { snapshotMetrics, resetMetricsForTests } from '../server/observability/runtime-metrics.mjs';

const context = { userId: 'qa', conversationId: 'obs', requestId: 'req-1' };
const policy = { allowed: ['read', 'write', 'external'], capabilities: ['system.status', 'system.diagnostics'], allowWrite: true, allowExternal: true };

function tool(name, risk = 'read', capability = 'system.status', execute = async () => ({ ok: true, data: { value: 1 } })) {
  registerTool({ name, description: name, risk, capability, validate: () => undefined, execute });
}

afterEach(() => {
  clearToolRegistry();
  resetMetricsForTests();
});

describe('tool observability', () => {
  it('records successful router and executor throughput plus latency', async () => {
    tool('read');
    const result = await routeTool('read', {}, context, policy);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    const metrics = snapshotMetrics();
    expect(metrics.counters['tool.router.throughput']).toBe(1);
    expect(metrics.counters['tool.executor.throughput']).toBe(1);
    expect(metrics.counters['tool.router.success']).toBe(1);
    expect(metrics.counters['tool.executor.success']).toBe(1);
    expect(metrics.latency['tool.router.latency'].count).toBe(1);
    expect(metrics.latency['tool.executor.latency'].count).toBe(1);
  });

  it('records every policy error with its unified code', async () => {
    tool('write', 'write');
    tool('external', 'external');
    const cases = [
      ['missing', {}, { allowed: [] }, 'PERMISSION_DENIED'],
      ['write', {}, { allowed: ['write'], allowWrite: false }, 'WRITE_NOT_ALLOWED'],
      ['external', {}, { allowed: ['external'], allowExternal: false }, 'EXTERNAL_NOT_ALLOWED'],
      ['missing', {}, { allowed: ['missing'] }, 'NOT_FOUND'],
      ['', {}, { allowed: [] }, 'INVALID_NAME'],
      ['read', [], policy, 'INVALID_INPUT'],
    ];
    for (const [name, input, routePolicy, code] of cases) {
      if (name === 'read') tool('read');
      const result = await routeTool(name, input, context, routePolicy);
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe(code);
      expect(result.retryable).toBe(false);
    }
    const metrics = snapshotMetrics();
    expect(metrics.counters['tool.router.error']).toBe(6);
    expect(metrics.counters['tool.router.error.permission_denied']).toBe(1);
    expect(metrics.counters['tool.router.error.write_not_allowed']).toBe(1);
    expect(metrics.counters['tool.router.error.external_not_allowed']).toBe(1);
    expect(metrics.counters['tool.router.error.not_found']).toBe(1);
    expect(metrics.counters['tool.router.error.invalid_name']).toBe(1);
    expect(metrics.counters['tool.router.error.invalid_input']).toBe(1);
  });

  it('records execution failures and retryability', async () => {
    tool('explode', 'read', 'system.status', async () => { throw new Error('boom'); });
    const result = await routeTool('explode', {}, context, policy);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('EXECUTION_FAILED');
    expect(result.retryable).toBe(true);
    const metrics = snapshotMetrics();
    expect(metrics.counters['tool.executor.error.execution_failed']).toBe(1);
    expect(metrics.latency['tool.executor.latency'].count).toBe(1);
  });

  it('records timeouts without counting a second executor result', async () => {
    tool('slow', 'read', 'system.status', async () => new Promise(() => undefined));
    const result = await routeTool('slow', {}, context, policy, 5);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('TIMEOUT');
    expect(result.retryable).toBe(true);
    const metrics = snapshotMetrics();
    expect(metrics.counters['tool.executor.throughput']).toBe(1);
    expect(metrics.counters['tool.executor.error.timeout']).toBe(1);
  });

  it('records capability denial before executor invocation', async () => {
    tool('capability', 'read', 'system.diagnostics', async () => ({ ok: true }));
    const result = await routeTool('capability', {}, context, { allowed: ['capability'], capabilities: ['system.status'] });
    expect(result.errorCode).toBe('CAPABILITY_DENIED');
    expect(snapshotMetrics().counters['tool.executor.throughput']).toBeUndefined();
  });
});
