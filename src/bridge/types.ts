export type BridgeMessageType = 'command' | 'event' | 'response';

export interface BridgeMessageEnvelope<TPayload = unknown> {
  readonly id: string;
  readonly type: BridgeMessageType;
  readonly method: string;
  readonly payload: TPayload;
  readonly timestamp: number;
  readonly version: '1';
}

export interface BridgeCommand<TPayload = unknown> extends BridgeMessageEnvelope<TPayload> {
  readonly type: 'command';
}

export interface BridgeEvent<TPayload = unknown> extends BridgeMessageEnvelope<TPayload> {
  readonly type: 'event';
}

export interface BridgeResponse<TPayload = unknown> extends BridgeMessageEnvelope<TPayload> {
  readonly type: 'response';
}

export type BridgeMessage<TPayload = unknown> =
  | BridgeCommand<TPayload>
  | BridgeEvent<TPayload>
  | BridgeResponse<TPayload>;

export interface RuntimeParams {
  readonly model: string;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly syncEnabled: boolean;
}

export type RuntimeParameterKey = keyof RuntimeParams;
export type RuntimeParameterValue = RuntimeParams[RuntimeParameterKey];

export interface RuntimeStatusPayload extends Partial<RuntimeParams> {
  readonly runtime?: Partial<RuntimeParams> | string;
}

export interface AndrewBridgeNative {
  send?: (message: BridgeMessage) => void | Promise<void>;
  request?: (message: BridgeCommand) => BridgeResponse | Promise<BridgeResponse>;
  openSettings?: () => void | Promise<void>;
  setRuntimeParameter?: (key: string, value: string) => void | Promise<void>;
  requestStatus?: () => unknown | Promise<unknown>;
  syncNow?: () => void | Promise<void>;
}

declare global {
  interface Window {
    AndrewBridge?: AndrewBridgeNative;
  }
}
