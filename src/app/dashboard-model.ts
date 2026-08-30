import { moduleRegistry } from './module-registry';

export interface DashboardModel {
  modules: Array<{ id: string; name: string; description: string }>;
  connectors: Array<{ id: string; name: string; enabled: boolean; authorized: boolean }>;
}

export function getDashboardModel(): DashboardModel {
  return {
    modules: moduleRegistry
      .filter((module) => module.enabled)
      .map((module) => ({
        id: module.id,
        name: module.label,
        description: module.description,
      })),
    connectors: [
      { id: 'web-public', name: 'Internet pública', enabled: true, authorized: false },
      { id: 'satellite-public', name: 'Datos satelitales públicos', enabled: true, authorized: false },
      { id: 'earthquake', name: 'Fuentes sísmicas públicas', enabled: true, authorized: false },
      { id: 'weather', name: 'Fuentes meteorológicas públicas', enabled: true, authorized: false },
    ],
  };
}
