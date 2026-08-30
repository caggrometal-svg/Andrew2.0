import { useMemo, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { earthquakeRisk, socialEventRisk, type Signal } from '@analysis/probabilistic';
import { defaultCapabilities } from '@assistant/autonomy';

const demoSignals: Signal[] = [
  { name: 'Actividad reciente', value: 0.62, weight: 1.2 },
  { name: 'Tendencia histórica', value: 0.48, weight: 1 },
  { name: 'Cambio de régimen', value: 0.31, weight: 0.8 },
  { name: 'Señal secundaria', value: 0.22, weight: 0.6 },
];

const demoEvidence: Evidence[] = [
  { source: 'Fuente A', claim: 'Señal observada', reliability: 0.82 },
  { source: 'Fuente B', claim: 'Interpretación alternativa', reliability: 0.58, contradicts: ['Fuente A'] },
];

export default function App() {
  const [domain, setDomain] = useState<'earthquake' | 'social'>('earthquake');
  const result = useMemo(() => domain === 'earthquake' ? earthquakeRisk(demoSignals) : socialEventRisk(demoSignals), [domain]);
  const critical = useMemo(() => assessEvidence(demoEvidence), []);

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <header>
        <h1>Andrew 2.0</h1>
        <p>Asistente independiente · análisis crítico · autonomía configurable · pronóstico probabilístico</p>
      </header>
      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <article><h2>Capacidades</h2><ul>{defaultCapabilities.map(c => <li key={c.id}><strong>{c.name}</strong>: {c.description}</li>)}</ul></article>
        <article><h2>Pronóstico</h2><div><button onClick={() => setDomain('earthquake')}>Riesgo sísmico</button>{' '}<button onClick={() => setDomain('social')}>Eventos sociales</button></div><p>Horizonte: {result.horizon} · Confianza: {result.confidence}</p><ol>{result.scenarios.map(s => <li key={s.label}>{s.label}: <strong>{Math.round(s.probability * 100)}%</strong></li>)}</ol><small>{result.warning}</small></article>
        <article><h2>Pensamiento crítico</h2><p>Confianza global: <strong>{critical.overallConfidence}</strong></p><p>Hechos: {critical.facts.length} · Contradicciones: {critical.contradictions.length} · Hipótesis: {critical.hypotheses.length}</p></article>
      </section>
    </main>
  );
}
