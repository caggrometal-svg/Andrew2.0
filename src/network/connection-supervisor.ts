const BACKEND_URL = (import.meta.env['VITE_ANDREW_BACKEND_URL'] || 'https://andrew2-api.onrender.com').trim().replace(/\/$/, '');
const HEALTH_INTERVAL_MS = 45_000;
const HEALTH_TIMEOUT_MS = 12_000;
const MAX_BACKOFF_MS = 30_000;

let timer: number | undefined;
let started = false;
let consecutiveFailures = 0;

function emit(status: 'connecting' | 'retrying' | 'connected' | 'error', detail?: string): void {
  try {
    window.dispatchEvent(new CustomEvent('andrew:network-status', { detail: { status, detail } }));
  } catch { /* Android WebView compatibility. */ }
}

function schedule(delayMs: number): void {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => { void probe(); }, delayMs);
}

async function probe(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emit('error', 'Sin conexión a Internet');
    schedule(HEALTH_INTERVAL_MS);
    return;
  }

  emit(consecutiveFailures ? 'retrying' : 'connecting', consecutiveFailures ? 'Reconectando con Andrew…' : 'Comprobando conexión…');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
    consecutiveFailures = 0;
    emit('connected', 'Conexión estable');
    schedule(HEALTH_INTERVAL_MS);
  } catch (error) {
    consecutiveFailures += 1;
    const backoff = Math.min(MAX_BACKOFF_MS, 1_500 * (2 ** Math.min(consecutiveFailures - 1, 5)));
    emit('retrying', `Backend no disponible · reconexión automática en ${Math.ceil(backoff / 1000)} s`);
    schedule(backoff);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function startAndrewConnectionSupervisor(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const onOnline = (): void => {
    consecutiveFailures = 0;
    void probe();
  };
  const onOffline = (): void => emit('error', 'Sin conexión a Internet');
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') void probe();
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisibility);

  void probe();
}

startAndrewConnectionSupervisor();
