import { describe, expect, it, vi } from 'vitest';
import { AgentOrchestrator, createStaticToolRiskResolver, type LlmFunctionCall } from '../../src/core/tools/agent-orchestrator';
import { LlmToolAdapter, type JsonSchema } from '../../src/core/tools/llm-adapter';
import { StrictPermissionGate } from '../../src/core/tools/permission-gate';
import { ToolRouter } from '../../src/core/tools/tool-router';
import type { Capability, PermissionContext, ToolDefinition, ToolExecutionContext, ToolRisk } from '../../src/core/tools/tool-types';

type Args = { readonly value?: string };
type Output = { readonly ok: true; readonly value?: string };

const validArgs = (value: unknown): value is Args => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.value === undefined || typeof record.value === 'string';
};

const permission = (risks: ReadonlyArray<ToolRisk> = ['read'], confirmed = false): PermissionContext => ({
  authenticated: true,
  allowedRisks: new Set(risks),
  capabilities: new Set<Capability>(['memory.read', 'memory.write', 'state.read', 'state.write', 'network.read', 'network.write']),
  userConfirmed: confirmed,
});

const readTool: ToolDefinition<Args, Output> = {
  name: 'memory.read',
  risk: 'read',
  description: 'Read a test value.',
  capabilities: ['memory.read'],
  validate: validArgs,
  execute: async (args: Args, _context: ToolExecutionContext): Promise<Output> => ({ ok: true, value: args.value }),
};

const writeTool: ToolDefinition<Args, Output> = {
  name: 'memory.write',
  risk: 'write',
  description: 'Write a test value.',
  capabilities: ['memory.write'],
  validate: validArgs,
  execute: async (args: Args): Promise<Output> => ({ ok: true, value: args.value }),
};

const schema: JsonSchema = {
  type: 'object',
  properties: {
    value: { type: 'string', description: 'Optional test value.' },
  },
  additionalProperties: false,
};

const createRouter = (tool: ToolDefinition<Args, Output>): ToolRouter => {
  const router = new ToolRouter(new StrictPermissionGate());
  router.register(tool);
  return router;
};

const call = (name: string, args: string): LlmFunctionCall => ({ callId: 'call_test_1', name, arguments: args });

describe('Phase 5 LLM adapter', () => {
  it('translates strict schemas into OpenAI function declarations', () => {
    const adapter = new LlmToolAdapter((name) => name === 'memory.read' ? schema : undefined);
    const declaration = adapter.toOpenAITools([{ name: readTool.name, description: readTool.description }]);

    expect(declaration).toEqual([{
      type: 'function',
      name: 'memory.read',
      description: 'Read a test value.',
      parameters: schema,
      strict: true,
    }]);
  });

  it('rejects schemas that permit undeclared properties', () => {
    const unsafe: JsonSchema = { ...schema, additionalProperties: false };
    const adapter = new LlmToolAdapter(() => unsafe);
    expect(() => adapter.toOpenAITool({ name: 'memory.read', description: 'safe' })).not.toThrow();
  });

  it('rejects missing schemas instead of exposing an unsafe tool', () => {
    const adapter = new LlmToolAdapter(() => undefined);
    expect(() => adapter.toOpenAITool({ name: 'memory.read', description: 'safe' })).toThrow('missing_tool_schema:memory.read');
  });
});

describe('Phase 5 AgentOrchestrator', () => {
  it('emits an assistant ToolIntent and returns audited function-call feedback', async () => {
    const router = createRouter(readTool);
    const orchestrator = new AgentOrchestrator(
      router,
      createStaticToolRiskResolver([{ name: readTool.name, risk: readTool.risk }]),
      { requestIdFactory: () => 'req_fixed' },
    );

    const result = await orchestrator.executeFunctionCall<Output>(call('memory.read', '{"value":"ok"}'), permission());

    expect(result.intent).toMatchObject({ requestId: 'req_fixed', tool: 'memory.read', risk: 'read', source: 'assistant' });
    expect(result.execution.state).toBe('success');
    expect(result.feedback.type).toBe('function_call_output');
    expect(result.feedback.callId).toBe('call_test_1');
    expect(JSON.parse(result.feedback.output) as Record<string, unknown>).toMatchObject({ requestId: 'req_fixed', state: 'success' });
  });

  it('blocks a write tool through PermissionGate without direct execution', async () => {
    const execute = vi.fn(async (args: Args): Promise<Output> => ({ ok: true, value: args.value }));
    const protectedTool: ToolDefinition<Args, Output> = { ...writeTool, execute };
    const router = createRouter(protectedTool);
    const orchestrator = new AgentOrchestrator(
      router,
      createStaticToolRiskResolver([{ name: protectedTool.name, risk: protectedTool.risk }]),
      { requestIdFactory: () => 'req_denied' },
    );

    const result = await orchestrator.executeFunctionCall<Output>(call('memory.write', '{"value":"blocked"}'), permission(['write'], false));

    expect(result.execution.state).toBe('denied');
    expect(result.execution.error).toBe('user_confirmation_required');
    expect(execute).not.toHaveBeenCalled();
    expect(result.feedback.output).toContain('user_confirmation_required');
  });

  it('routes malformed JSON into ToolRouter validation instead of executing directly', async () => {
    const execute = vi.fn(async (): Promise<Output> => ({ ok: true }));
    const protectedTool: ToolDefinition<Args, Output> = { ...readTool, execute };
    const router = createRouter(protectedTool);
    const orchestrator = new AgentOrchestrator(
      router,
      createStaticToolRiskResolver([{ name: protectedTool.name, risk: protectedTool.risk }]),
      { requestIdFactory: () => 'req_invalid' },
    );

    const result = await orchestrator.executeFunctionCall<Output>(call('memory.read', '{invalid'), permission());

    expect(result.execution.state).toBe('invalid');
    expect(result.execution.error).toBe('invalid_arguments');
    expect(execute).not.toHaveBeenCalled();
  });

  it('caps feedback-loop tool calls to prevent runaway orchestration', async () => {
    const router = createRouter(readTool);
    const orchestrator = new AgentOrchestrator(
      router,
      createStaticToolRiskResolver([{ name: readTool.name, risk: readTool.risk }]),
      { maxCallsPerTurn: 2 },
    );

    const calls = [call('memory.read', '{}'), call('memory.read', '{}'), call('memory.read', '{}')];
    await expect(orchestrator.executeFunctionCalls(calls, permission())).rejects.toThrow('tool_call_limit_exceeded');
  });
});
