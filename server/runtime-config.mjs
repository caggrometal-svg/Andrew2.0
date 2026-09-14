const VERSION = (process.env.ANDREW_RUNTIME_VERSION || '1').trim();
const RUNTIME_JSON = (process.env.ANDREW_RUNTIME_CONFIG || '{}').trim();

function parseConfig() {
  try {
    const parsed = JSON.parse(RUNTIME_JSON);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function getRuntimeConfig() {
  return {
    ok: true,
    version: VERSION,
    issuedAt: new Date().toISOString(),
    config: parseConfig(),
  };
}
