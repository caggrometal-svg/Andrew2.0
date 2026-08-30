export interface C33ContentBrief { title: string; hook: string; thesis: string; evidence: string[]; counterpoints: string[]; uncertainty: string; script: string; }

export function createC33Brief(topic: string, evidence: string[] = []): C33ContentBrief {
  const clean = topic.trim() || 'un fenómeno inexplicado';
  return {
    title: `EXPEDIENTE C33: ${clean}`,
    hook: `¿Y si la explicación más evidente no fuera la única posibilidad?`,
    thesis: `Investigar ${clean} separando hechos comprobables, hipótesis y especulación.`,
    evidence,
    counterpoints: ['¿Qué evidencia contradice la hipótesis?', '¿Qué explicación convencional compite con ella?', '¿Qué dato nuevo podría cambiar la conclusión?'],
    uncertainty: 'Nivel de incertidumbre: por determinar con fuentes verificables.',
    script: `Hoy abrimos un nuevo expediente: ${clean}. Primero, los hechos. Después, las hipótesis. Y finalmente, lo que todavía no podemos explicar. La pregunta no es qué queremos creer, sino qué hipótesis resiste mejor la evidencia.`,
  };
}
