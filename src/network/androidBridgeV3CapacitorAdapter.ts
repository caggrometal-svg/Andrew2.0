import type { AndroidBridgeCommandEnvelope } from './androidBridgeV3';
import type { BridgeExecutorResult } from './androidBridgeV3Inbox';
import { AndroidBridgeV3Executor, type AndroidBridgeExecutionHooks } from './androidBridgeV3Executor';

/**
 * Phase 22: Capacitor-safe native boundary.
 *
 * The web layer never invokes arbitrary native methods. A native bridge is
 * injected through the four explicit hooks below when present. Runtime
 * parameters cross the WebView boundary as key/value strings because the
 * Android JavascriptInterface does not marshal arbitrary JavaScript objects.
 */
export type CapacitorBridgePlugin = AndroidBridgeExecutionHooks;

export function createCapacitorBridgeExecutor(plugin: CapacitorBridgePlugin = {}) {
  const executor = new AndroidBridgeV3Executor(plugin);
  return (command: AndroidBridgeCommandEnvelope): Promise<BridgeExecutorResult> => executor.execute(command);
}

export function createCapacitorBridgePluginFromGlobal(globalObject: unknown): CapacitorBridgePlugin {
  if (!globalObject || typeof globalObject !== 'object') return {};
  const candidate = globalObject as Record<string, unknown>;
  const plugin = candidate['AndrewBridge'] as Record<string, unknown> | undefined;
  if (!plugin || typeof plugin !== 'object') return {};

  const hooks: CapacitorBridgePlugin = {};
  if (typeof plugin['openSettings'] === 'function') hooks.openSettings = () => (plugin['openSettings'] as () => void)();
  if (typeof plugin['setRuntimeParameter'] === 'function') {
    hooks.setRuntimeParameter = (payload) => {
      const key = typeof payload['key'] === 'string' ? payload['key'] : '';
      const value = payload['value'];
      if (!key || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) return;
      (plugin['setRuntimeParameter'] as (key: string, value: string) => void)(key, String(value));
    };
  }
  if (typeof plugin['requestStatus'] === 'function') hooks.requestStatus = () => (plugin['requestStatus'] as () => void)();
  if (typeof plugin['syncNow'] === 'function') hooks.syncNow = () => (plugin['syncNow'] as () => void)();
  return hooks;
}
