export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
}

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly model?: string;
  readonly timeoutMs?: number;
}

export interface ChatResponse {
  readonly provider: string;
  readonly model: string;
  readonly content: string;
  readonly usage?: Readonly<Record<string, number>>;
}

export interface ChatProviderPort {
  readonly id: string;
  execute(request: ChatRequest): Promise<ChatResponse>;
}
