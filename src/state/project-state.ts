import type { ProjectState } from '../core/types';

export function createProjectState(projectId: string): ProjectState {
  return {
    projectId,
    status: 'idle',
    autonomy: 'restricted',
    updatedAt: new Date().toISOString(),
    metadata: {},
  };
}

export function updateProjectState(
  state: ProjectState,
  patch: Partial<Omit<ProjectState, 'projectId'>>,
): ProjectState {
  return {
    ...state,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}
