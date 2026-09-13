export interface ToolContext {
  readonly requestId: string;
  readonly actor: string;
  readonly signal?: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly description: string;
  readonly execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

export interface ToolRegistryPort {
  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void;
  get(id: string): ToolDefinition<unknown, unknown> | undefined;
  list(): readonly string[];
}

export type ToolPort = ToolDefinition<unknown, unknown>;
