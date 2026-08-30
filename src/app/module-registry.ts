import { IAC33_CONFIG } from './iac33-config';

export interface IAC33Module {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export const moduleRegistry: IAC33Module[] = [
  { id: 'seismic-chile', label: 'Sismos Chile', description: 'Análisis de señales y escenarios sísmicos para Chile.', enabled: IAC33_CONFIG.modules.seismicChile },
  { id: 'rainfall-chile', label: 'Lluvias Chile', description: 'Análisis de señales y escenarios de precipitaciones en Chile.', enabled: IAC33_CONFIG.modules.rainfallChile },
  { id: 'global-conflict', label: 'Conflictos mundiales', description: 'Análisis de escenarios y señales de conflicto internacional.', enabled: IAC33_CONFIG.modules.globalConflict },
  { id: 'critical-research', label: 'Investigación C33', description: 'Investigación con separación entre evidencia, hipótesis y especulación.', enabled: IAC33_CONFIG.modules.criticalResearch },
  { id: 'memory', label: 'Memoria y aprendizaje', description: 'Persistencia de memoria y aprendizaje a partir de actividad y feedback.', enabled: IAC33_CONFIG.modules.memory },
  { id: 'activity-audit', label: 'Auditoría de actividad', description: 'Registro de decisiones y actividad para trazabilidad.', enabled: IAC33_CONFIG.modules.activityAudit },
];
