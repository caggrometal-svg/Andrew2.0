export interface RegisteredModule {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export const moduleRegistry: RegisteredModule[] = [
  { id: 'critical-analysis', label: 'Pensamiento crítico', description: 'Evalúa evidencia, contradicciones e hipótesis.', enabled: true },
  { id: 'probabilistic-forecast', label: 'Análisis probabilístico', description: 'Genera escenarios con incertidumbre explícita.', enabled: true },
  { id: 'learning-loop', label: 'Aprendizaje', description: 'Calibra resultados y conserva lecciones históricas.', enabled: true },
  { id: 'public-network', label: 'Red pública', description: 'Consulta fuentes públicas autorizadas.', enabled: true },
  { id: 'expediente-c33', label: 'Expediente C33', description: 'Estructura investigaciones y contenido.', enabled: true },
];
