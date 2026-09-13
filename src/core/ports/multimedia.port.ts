export interface MediaInput {
  readonly id: string;
  readonly mimeType: string;
  readonly uri: string;
}

export interface MediaOutput {
  readonly id: string;
  readonly mimeType: string;
  readonly uri: string;
}

export interface MultimediaPort {
  transcribe?(input: MediaInput, signal?: AbortSignal): Promise<string>;
  analyzeImage?(input: MediaInput, signal?: AbortSignal): Promise<string>;
  processStream?(input: MediaInput, signal?: AbortSignal): AsyncIterable<Uint8Array>;
  render?(inputs: readonly MediaInput[], signal?: AbortSignal): Promise<MediaOutput>;
}
