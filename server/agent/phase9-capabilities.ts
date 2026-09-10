import type { AgentTaskStep } from './phase9-types';

export type Phase9Capability = 'memory.read' | 'memory.write' | 'memory.search' | 'system.status' | 'system.diagnostics' | 'system.configuration' | 'media.inspect' | 'media.process' | 'media.pipeline' | 'agent.plan' | 'agent.execute' | 'agent.verify';

export interface Phase9CapabilityPolicy { readonly allowed: readonly Phase9Capability[]; readonly critical?: readonly Phase9Capability[]; }

export function createCapabilityAuthorizer(policy: Phase9CapabilityPolicy) {
  return { authorize: async (step: AgentTaskStep): Promise<boolean> => policy.allowed.includes(step.toolName as Phase9Capability) && (!step.critical || policy.critical?.includes(step.toolName as Phase9Capability) === true) };
}
