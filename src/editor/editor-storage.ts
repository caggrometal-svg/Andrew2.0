import type { EditorProject } from './types';

const KEY = 'andrew.editor.projects.v1';

function read(): EditorProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EditorProject[]) : [];
  } catch {
    return [];
  }
}

function write(projects: EditorProject[]) {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function listEditorProjects(): EditorProject[] {
  return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveEditorProject(project: EditorProject): void {
  const projects = read().filter(item => item.id !== project.id);
  write([...projects, project]);
}

export function deleteEditorProject(id: string): void {
  write(read().filter(project => project.id !== id));
}

export function createEditorProject(name = 'Proyecto sin título'): EditorProject {
  return {
    id: crypto.randomUUID(),
    name,
    aspectRatio: '9:16',
    assets: [],
    clips: [],
    textLayers: [],
    currentTime: 0,
    updatedAt: new Date().toISOString(),
  };
}
