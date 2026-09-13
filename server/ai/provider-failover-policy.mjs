export const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
export const TRANSIENT_RETRY_ATTEMPTS = 2;
export const TRANSIENT_RETRY_BASE_MS = 900;
export const GLOBAL_UNAVAILABLE_ERROR = 'Servicio no disponible temporalmente';

export function isProviderRateLimited(status, message = '') {
  return status === 429 || /rate\s*limit|rate_limit|rpd|requests\s+per\s+day|quota\s+exhausted/i.test(String(message));
}

export function classifyProviderFailure({ status, message = '' } = {}) {
  if (isProviderRateLimited(status, message)) {
    return { kind: 'rate-limit', retrySameProvider: false, openImmediately: true, cooldownMs: RATE_LIMIT_COOLDOWN_MS };
  }
  if (status === 408 || status === 409 || status >= 500) {
    return { kind: 'transient', retrySameProvider: true, openImmediately: false, maxAttempts: TRANSIENT_RETRY_ATTEMPTS };
  }
  return { kind: 'permanent', retrySameProvider: false, openImmediately: false };
}
