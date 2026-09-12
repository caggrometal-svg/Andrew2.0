const counters = new Map();
const latency = new Map();
const startedAt = Date.now();

const METRIC_NAME = /^[a-z0-9_.:-]{1,100}$/;

function validName(name) {
  return typeof name === 'string' && METRIC_NAME.test(name);
}

function addCounter(name, value) {
  if (!validName(name)) return;
  const amount = Math.max(0, Number(value) || 0);
  counters.set(name, (counters.get(name) || 0) + amount);
}

function observeLatency(name, durationMs) {
  if (!validName(name)) return;
  const value = Math.max(0, Number(durationMs) || 0);
  const current = latency.get(name) || { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 };
  current.count += 1;
  current.totalMs += value;
  current.minMs = Math.min(current.minMs, value);
  current.maxMs = Math.max(current.maxMs, value);
  latency.set(name, current);
}

export function recordToolExecution({ toolName, durationMs, ok, errorCode, phase = 'executor' }) {
  const prefix = `tool.${phase}`;
  addCounter(`${prefix}.throughput`, 1);
  addCounter(`${prefix}.success`, ok ? 1 : 0);
  addCounter(`${prefix}.error`, ok ? 0 : 1);
  if (errorCode) addCounter(`${prefix}.error.${errorCode.toLowerCase()}`, 1);
  observeLatency(`${prefix}.latency`, durationMs);
  if (toolName) {
    addCounter(`${prefix}.tool.${toolName}.throughput`, 1);
    addCounter(`${prefix}.tool.${toolName}.${ok ? 'success' : 'error'}`, 1);
    observeLatency(`${prefix}.tool.${toolName}.latency`, durationMs);
  }
}

export function recordRouterRequest({ durationMs, ok, errorCode }) {
  recordToolExecution({ toolName: 'router', durationMs, ok, errorCode, phase: 'router' });
}

export function snapshotMetrics() {
  const latencySnapshot = {};
  for (const [name, value] of latency) {
    latencySnapshot[name] = {
      count: value.count,
      totalMs: value.totalMs,
      minMs: value.count ? value.minMs : 0,
      maxMs: value.maxMs,
      avgMs: value.count ? value.totalMs / value.count : 0,
    };
  }
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: Object.fromEntries(counters),
    latency: latencySnapshot,
  };
}

export function resetMetricsForTests() {
  counters.clear();
  latency.clear();
}
