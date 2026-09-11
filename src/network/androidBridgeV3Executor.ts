import type { AndroidBridgeCommand, AndroidBridgeCommandEnvelope } from './androidBridgeV3';
import type { BridgeExecutor, BridgeExecutorResult } from './androidBridgeV3Inbox';

export type AndroidBridgeExecutionHooks = {
  openSettings?: () => Promise<void> | void;
  setRuntimeParameter?: (payload: Record<string, unknown>) => Promise<void> | void;
  requestStatus?: () => Promise<void> | void;
  syncNow?: () => Promise<void> | void;
};

const ALLOWED = new Set<AndroidBridgeCommand>([
  'open_settings',
  'set_runtime_parameter',
  'request_status',
  'sync_now',
]);

function validPayload(payload: unknown): payload is Record<string, unknown> {
  return payload === undefined || (typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    && Object.keys(payload).length <= 8);
}

/** Phase 21 controlled adapter: only four explicit Android operations are exposed. */
export class AndroidBridgeV3Executor {
  private readonly hooks: AndroidBridgeExecutionHooks;

  constructor(hooks: AndroidBridgeExecutionHooks = {}) {
    this.hooks = hooks;
  }

  async execute(command: AndroidBridgeCommandEnvelope): Promise<BridgeExecutorResult> {
    if (!ALLOWED.has(command.command)) return { ok: false, error: 'unsupported' };
    if (!validPayload(command.payload)) return { ok: false, error: 'invalid_payload' };
    if (command.expiresAt <= Date.now()) return { ok: false, error: 'expired' };

    switch (command.command) {
      case 'open_settings':
        await this.hooks.openSettings?.();
        return { ok: true };
      case 'set_runtime_parameter':
        await this.hooks.setRuntimeParameter?.(command.payload ?? {});
        return { ok: true };
      case 'request_status':
        await this.hooks.requestStatus?.();
        return { ok: true };
      case 'sync_now':
        await this.hooks.syncNow?.();
        return { ok: true };
    }
  }
}

export const createAndroidBridgeV3Executor = (hooks?: AndroidBridgeExecutionHooks): BridgeExecutor => {
  const executor = new AndroidBridgeV3Executor(hooks);
  return executor.execute.bind(executor);
};
