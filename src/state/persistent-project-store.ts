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
      const metadataName = state.metadata['name'];
      const name = typeof metadataName === 'string' && metadataName.length > 0 ? metadataName : state.projectId;
      projects.push({ ...state, name });
      this.save(projects);
      return;
    }

    const current = projects[index];
    if (!current) return;

    projects[index] = {
      ...current,
      ...state,
      name: current.name,
    };
    this.save(projects);
  }
}
