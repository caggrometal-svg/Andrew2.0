export type AIProviderId = string;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
}

export interface AIResponse {
  provider: AIProviderId;
  model: string;
  content: string;
  completedAt: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export type AIErrorCode =
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'EXECUTION_FAILED';

export interface AIProviderError extends Error {
  code: AIErrorCode;
  retryable: boolean;
}

export interface AIProvider {
  readonly id: AIProviderId;
  isAvailable(): boolean | Promise<boolean>;
  generate(request: AIRequest): Promise<AIResponse>;
}
