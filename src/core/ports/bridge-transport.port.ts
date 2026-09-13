export interface BridgeEnvelope<TPayload = unknown> {
  readonly version: number;
  readonly commandId: string;
  readonly command: string;
  readonly issuedAt: string;
  readonly payload: TPayload;
}

export interface BridgeAck {
  readonly commandId: string;
  readonly accepted: boolean;
  readonly reason?: string;
}

export interface BridgeTransportPort {
  receive(): Promise<readonly BridgeEnvelope[]>;
  acknowledge(ack: BridgeAck): Promise<void>;
  send<TPayload>(envelope: BridgeEnvelope<TPayload>): Promise<void>;
}
