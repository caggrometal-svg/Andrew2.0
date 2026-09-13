export type CoreBridgeCommandName = 'open_settings' | 'set_runtime_parameter' | 'request_status' | 'sync_now';

export interface CoreBridgeCommand<TPayload = unknown> {
  readonly version: number;
  readonly commandId: string;
  readonly command: CoreBridgeCommandName;
  readonly issuedAt: string;
  readonly payload?: TPayload;
}

export interface CoreBridgeResult {
  readonly commandId: string;
  readonly accepted: boolean;
  readonly reason?: string;
}
