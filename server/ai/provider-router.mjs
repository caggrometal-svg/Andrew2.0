const DEFAULT_WEIGHTS = Object.freeze({ openai: 1, gemini: 1, anthropic: 1 });
const state = { revision: 0, parameters: new Map(), weights: new Map(Object.entries(DEFAULT_WEIGHTS)) };

function parameter(key, value) {
  if (key === 'model') {
    if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new TypeError('invalid model');
    return value.trim();
  }
  if (key === 'timeoutMs' || key === 'pollIntervalMs') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 300000) throw new TypeError(`invalid ${key}`);
    return Math.trunc(value);
  }
  if (key === 'syncEnabled') {
    if (typeof value !== 'boolean') throw new TypeError('invalid syncEnabled');
    return value;
  }
  if (key.startsWith('providerWeight.')) {
    const provider = key.slice('providerWeight.'.length);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(provider) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new TypeError('invalid provider weight');
    state.weights.set(provider, value);
    return value;
  }
  throw new TypeError('unsupported runtime parameter');
}

export function updateRuntimeParameter({ key, value }) {
  const normalized = parameter(key, value);
  if (!key.startsWith('providerWeight.')) state.parameters.set(key, normalized);
  state.revision += 1;
  return { key, value: normalized, revision: state.revision, weights: Object.fromEntries(state.weights) };
}

export function getRuntimeState() {
  return { revision: state.revision, parameters: Object.fromEntries(state.parameters), weights: Object.fromEntries(state.weights) };
}

export function applyBridgeRuntimeCommand(command) {
  if (!command || command.command !== 'set_runtime_parameter') return null;
  const payload = command.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('invalid runtime command payload');
  return updateRuntimeParameter({ key: payload.key, value: payload.value });
}
