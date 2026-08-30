import type { ProjectState } from '../core/types';
import { createProjectState, updateProjectState } from '../state/project-state';

export interface ProjectRecord extends ProjectState {
  name: string;
}

export class ProjectManager {
  private readonly projects = new Map<string, ProjectRecord>();

  create(id: string, name: string): ProjectRecord {
    if (this.projects.has(id)) throw new Error(`Project already exists: ${id}`);
    const record: ProjectRecord = { ...createProjectState(id), name };
    this.projects.set(id, record);
    return record;
  }

  get(id: string): ProjectRecord | undefined {
    return this.projects.get(id);
  }

  update(id: string, patch: Partial<Omit<ProjectState, 'projectId'>>): ProjectRecord {
    const current = this.projects.get(id);
    if (!current) throw new Error(`Project not found: ${id}`);
    const updated = updateProjectState(current, patch);
    this.projects.set(id, { ...current, ...updated });
    return this.projects.get(id)!;
  }

  list(): ProjectRecord[] {
    return [...this.projects.values()];
  }
}
