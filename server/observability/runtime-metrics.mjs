const counters = new Map();
const startedAt = Date.now();

export function incrementMetric(name, value = 1) {
  if (typeof name !== 'string' || !/^[a-z0-9_.:-]{1,100}$/.test(name)) return;
  const current = counters.get(name) || 0;
  counters.set(name, current + Math.max(0, Number(value) || 0));
}

export function snapshotMetrics() {
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: Object.fromEntries(counters),
  };
}

export function resetMetricsForTests() {
  counters.clear();
}
