export type AutonomyLevel = 'restricted' | 'assisted' | 'autonomous';

export interface Capability { id: string; name: string; description: string; enabled: boolean; requiresConfirmation: boolean; }

export const defaultCapabilities: Capability[] = [
  { id: 'network.read', name: 'Red pública', description: 'Consultar fuentes públicas y comparar información.', enabled: true, requiresConfirmation: false },
  { id: 'satellite.public', name: 'Datos satelitales públicos', description: 'Consultar servicios públicos de observación de la Tierra.', enabled: true, requiresConfirmation: false },
  { id: 'analysis.critical', name: 'Pensamiento crítico', description: 'Separar evidencia, hipótesis y contradicciones.', enabled: true, requiresConfirmation: false },
  { id: 'forecast.earthquake', name: 'Riesgo sísmico', description: 'Calcular escenarios probabilísticos a partir de datos disponibles.', enabled: true, requiresConfirmation: false },
  { id: 'forecast.social', name: 'Eventos sociales', description: 'Analizar señales sociales y producir escenarios probabilísticos.', enabled: true, requiresConfirmation: false },
  { id: 'content.c33', name: 'Expediente C33', description: 'Crear investigaciones, guiones, hooks y contraargumentos.', enabled: true, requiresConfirmation: false },
  { id: 'workflow.execute', name: 'Ejecución autónoma', description: 'Encadenar acciones autorizadas y registrar cada paso.', enabled: true, requiresConfirmation: true },
];

export function canExecute(level: AutonomyLevel, capability: Capability): boolean {
  if (!capability.enabled) return false;
  if (capability.requiresConfirmation) return level === 'autonomous';
  return true;
}
