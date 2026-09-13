const LEGACY_COMMANDS = new Set(['open_settings', 'set_runtime_parameter', 'request_status', 'sync_now']);
const LEGACY_KEYS = new Set(['model', 'timeoutMs', 'pollIntervalMs', 'syncEnabled']);
const PROVIDER_WEIGHT = /^providerWeight\.[A-Za-z0-9_-]{1,64}$/;

function validKey(key) {
  return LEGACY_KEYS.has(key) || PROVIDER_WEIGHT.test(key);
}

function validValue(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function normalizeLegacyBridgeAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return null;
  const command = action.command;
  if (typeof command !== 'string' || !LEGACY_COMMANDS.has(command)) return null;

  if (command !== 'set_runtime_parameter') {
    if (action.payload !== undefined && (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload))) return null;
    return Object.freeze({ command });
  }

  const payload = action.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (typeof payload.key !== 'string' || !validKey(payload.key) || !Object.prototype.hasOwnProperty.call(payload, 'value') || !validValue(payload.value)) {
    return null;
  }

  return Object.freeze({
    command,
    payload: Object.freeze({ key: payload.key, value: payload.value }),
  });
}

export function toBridgeEnvelope(action, commandId, issuedAt) {
  const normalized = normalizeLegacyBridgeAction(action);
  if (!normalized || typeof commandId !== 'string' || !commandId || typeof issuedAt !== 'string' || !issuedAt) return null;
  return Object.freeze({
    version: 3,
    commandId,
    command: normalized.command,
    issuedAt,
    ...(normalized.payload === undefined ? {} : { payload: normalized.payload }),
  });
}
