export type RuntimeCapability = 'memory.read' | 'memory.write' | 'system.status' | 'system.diagnostics' | 'media.inspect' | 'media.process' | 'agent.plan' | 'agent.execute' | 'agent.verify';

export interface CapabilityRequest { readonly capability: RuntimeCapability; readonly authorized: boolean; readonly critical?: boolean; }

export function assertCapability(request: CapabilityRequest): void {
  if (!request.authorized) throw new Error(`CAPABILITY_DENIED:${request.capability}`);
  if (request.critical !== true && request.capability === 'agent.execute') throw new Error('CAPABILITY_CRITICAL_AUTH_REQUIRED:agent.execute');
}

export function canUseCapability(capability: RuntimeCapability, allowed: readonly RuntimeCapability[], explicitlyAuthorized = false): boolean {
  if (!allowed.includes(capability)) return false;
  if (capability === 'agent.execute' && !explicitlyAuthorized) return false;
  return true;
}
