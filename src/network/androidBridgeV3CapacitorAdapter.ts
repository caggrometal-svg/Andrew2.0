import type { AndroidBridgeCommandEnvelope } from './androidBridgeV3';
import type { BridgeExecutorResult } from './androidBridgeV3Inbox';
import { AndroidBridgeV3Executor, type AndroidBridgeExecutionHooks } from './androidBridgeV3Executor';

/**
 * Phase 22: Capacitor-safe native boundary.
 *
 * The web layer never invokes arbitrary native methods. A native Capacitor plugin
 * can be injected through the four explicit hooks below when present. Until then,
 * commands remain no-ops with a successful protocol result, preserving the
 * allow-listed bridge contract without broad OS access.
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
    hooks.setRuntimeParameter = (payload) => (plugin['setRuntimeParameter'] as (payload: Record<string, unknown>) => void)(payload);
  }
  if (typeof plugin['requestStatus'] === 'function') hooks.requestStatus = () => (plugin['requestStatus'] as () => void)();
  if (typeof plugin['syncNow'] === 'function') hooks.syncNow = () => (plugin['syncNow'] as () => void)();
  return hooks;
}
