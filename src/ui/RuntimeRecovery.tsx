export function recoverRuntime(): void {
  try { window.dispatchEvent(new CustomEvent('andrew:runtime-recover')); } catch {}
}
