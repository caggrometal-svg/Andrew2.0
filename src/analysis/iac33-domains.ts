export const IAC33_DOMAINS = {
  earthquakeChile: { id: 'earthquake-chile', name: 'Sismos en Chile', mode: 'probabilistic', note: 'Analiza señales sísmicas y contexto histórico; no afirma fecha, lugar o magnitud futura como certeza.' },
  rainfallChile: { id: 'rainfall-chile', name: 'Lluvias en Chile', mode: 'probabilistic', note: 'Combina observaciones meteorológicas y escenarios; no reemplaza alertas oficiales.' },
  worldConflict: { id: 'world-conflict', name: 'Conflictos mundiales', mode: 'scenario', note: 'Evalúa indicadores y escenarios geopolíticos; no determina que una guerra ocurrirá.' },
  criticalResearch: { id: 'critical-research', name: 'Investigación crítica', mode: 'evidence', note: 'Contrasta afirmaciones, fuentes, contradicciones y explicaciones alternativas.' },
} as const;

export type IAC33Domain = keyof typeof IAC33_DOMAINS;

export const IAC33_PRINCIPLES = [
  'Separar hechos, inferencias e hipótesis.',
  'Buscar evidencia que confirme y contradiga una hipótesis.',
  'Asignar incertidumbre explícita.',
  'Registrar fuente y fecha de cada señal externa.',
  'No presentar escenarios probabilísticos como certezas.',
];
