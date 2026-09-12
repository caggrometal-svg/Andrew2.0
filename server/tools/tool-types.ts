export type ToolRisk = 'read' | 'write' | 'external';

export type ToolInput = Readonly<Record<string, unknown>>;

export type ToolErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'CAPABILITY_DENIED'
  | 'WRITE_NOT_ALLOWED'
  | 'EXTERNAL_NOT_ALLOWED'
  | 'TIMEOUT'
  | 'EXECUTION_FAILED'
  | 'RESULT_INVALID'
  | 'VERIFICATION_FAILED';

export interface ToolError {
  readonly code: ToolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ToolContext {
  readonly userId: string;
  readonly conversationId: string;
  readonly requestId: string;
  readonly memory?: ToolMemory;
  readonly media?: MediaToolService;
}

export interface ToolMemory {
  readonly read: (userId: string, key: string) => Promise<unknown | null>;
  readonly write: (userId: string, key: string, value: unknown) => Promise<void>;
}

export interface MediaToolService {
  readonly describe: (input: ToolInput) => Promise<unknown>;
}

export interface ToolMetadata {
  readonly toolName: string;
  readonly risk: ToolRisk;
  readonly durationMs: number;
}

export interface ToolDefinition<TInput extends ToolInput = ToolInput> {
  readonly name: string;
  readonly description: string;
  readonly risk: ToolRisk;
  readonly capability?: string;
  readonly validate: (input: TInput) => void;
  readonly execute: (input: TInput, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolResult<TData = unknown> {
  readonly ok: boolean;
  readonly data?: TData;
  readonly error?: string;
  readonly errorCode?: ToolErrorCode;
  readonly retryable?: boolean;
  readonly metadata?: ToolMetadata;
}
