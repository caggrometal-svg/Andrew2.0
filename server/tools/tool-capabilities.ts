export type ToolCapability =
  | 'memory.read'
  | 'memory.write'
  | 'system.status'
  | 'system.diagnostics'
  | 'media.inspect'
  | 'media.process'
  | 'agent.plan'
  | 'agent.execute'
  | 'agent.verify';

export const TOOL_CAPABILITIES: readonly ToolCapability[] = Object.freeze([
  'memory.read',
  'memory.write',
  'system.status',
  'system.diagnostics',
  'media.inspect',
  'media.process',
  'agent.plan',
  'agent.execute',
  'agent.verify',
]);

export function assertCapability(value: string): asserts value is ToolCapability {
  if (!(TOOL_CAPABILITIES as readonly string[]).includes(value)) {
    throw new Error(`TOOL_CAPABILITY_UNKNOWN:${value}`);
  }
}
