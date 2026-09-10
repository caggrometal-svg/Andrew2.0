import type { ToolDefinition, ToolInput } from './tool-types';

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (tool.name.trim().length === 0) throw new Error('TOOL_INVALID_NAME');
  if (tool.description.trim().length === 0) throw new Error('TOOL_INVALID_DESCRIPTION');
  if (tools.has(tool.name)) throw new Error(`TOOL_ALREADY_REGISTERED:${tool.name}`);
  tools.set(tool.name, Object.freeze(tool));
}

export function getTool(name: string): ToolDefinition {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) throw new Error('TOOL_INVALID_NAME');
  const tool = tools.get(normalizedName);
  if (tool === undefined) throw new Error(`TOOL_NOT_ALLOWED:${normalizedName}`);
  return tool;
}

export function hasTool(name: string): boolean {
  return tools.has(name.trim());
}

export function listTools(): readonly ToolDefinition[] {
  return Object.freeze(Array.from(tools.values()));
}

export function clearToolRegistry(): void {
  tools.clear();
}

export function assertToolInput(input: ToolInput): void {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('TOOL_INVALID_INPUT');
  }
}
