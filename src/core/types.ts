export type AutonomyLevel = 'restricted' | 'assisted' | 'autonomous';

export type PermissionDecision = 'allow' | 'deny';

export type Capability =
  | 'memory.read'
  | 'memory.write'
  | 'state.read'
  | 'state.write'
  | 'network.read'
  | 'network.write'
  | 'analysis.run'
  | 'project.write'
  | 'content.generate';

export interface PermissionGrant {
  capability: Capability;
  decision: PermissionDecision;
  grantedAt: string;
  source?: string;
}

export interface ProjectState {
  projectId: string;
  status: 'idle' | 'active' | 'paused' | 'completed' | 'error';
  autonomy: AutonomyLevel;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface ActivityRecord {
  id: string;
  timestamp: string;
  action: string;
  capability?: Capability;
  result: 'success' | 'denied' | 'error';
  details?: Record<string, unknown>;
}

export interface AssistantContext {
  project: ProjectState;
  permissions: PermissionGrant[];
  recentActivity: ActivityRecord[];
}

export interface PlannedAction {
  id: string;
  action: string;
  capability: Capability;
  requiresConfirmation: boolean;
}

export interface AnalysisRequest {
  domain: string;
  horizon: string;
  signals: Array<{ name: string; value: number; weight?: number }>;
}

export interface AnalysisEngine<TResult = unknown> {
  analyze(request: AnalysisRequest): TResult;
}
