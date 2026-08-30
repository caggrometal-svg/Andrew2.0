import { defaultConnectors } from '../core/connectors';
import { defaultPermissions } from '../core/permissions';

export const IAC33_MODULES = [
  { id: 'seismic', name: 'Sismos Chile', description: 'Escenarios probabilísticos basados en observaciones.' },
  { id: 'rainfall', name: 'Lluvias Chile', description: 'Análisis de precipitación y escenarios meteorológicos.' },
  { id: 'conflict', name: 'Conflictos mundiales', description: 'Escenarios de tensión y escalada.' },
  { id: 'investigation', name: 'Investigación C33', description: 'Contraste de hipótesis, fuentes y anomalías.' },
  { id: 'memory', name: 'Memoria', description: 'Conocimiento y consultas almacenadas localmente.' },
  { id: 'sources', name: 'Fuentes', description: 'Registro y calidad de fuentes utilizadas.' },
  { id: 'connectors', name: 'Conectores', description: 'Estado de las conexiones autorizadas.' },
  { id: 'activity', name: 'Actividad', description: 'Trazabilidad de acciones y análisis.' },
] as const;

export function getDashboardModel() {
  return { name: 'IAC33', subtitle: 'Inteligencia · Análisis · C33', modules: IAC33_MODULES, connectors: defaultConnectors, permissions: defaultPermissions };
}
