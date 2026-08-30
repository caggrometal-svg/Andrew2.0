import type { ProjectState } from '../core/types';
import type { StorageProvider } from '../storage/storage-provider';
import type { ProjectRecord } from '../projects/project-manager';

const KEY = 'iac33.projects.v1';

export class PersistentProjectStore {
  constructor(private readonly storage: StorageProvider) {}

  load(): ProjectRecord[] {
    return this.storage.get<ProjectRecord[]>(KEY) ?? [];
  }

  save(projects: ProjectRecord[]): void {
    this.storage.set(KEY, projects);
  }

  saveState(state: ProjectState): void {
    const projects = this.load();
    const index = projects.findIndex((project) => project.projectId === state.projectId);
    if (index < 0) {
      projects.push({ ...state, name: state.projectId });
    } else {
      projects[index] = { ...projects[index], ...state };
    }
    this.save(projects);
  }
}
