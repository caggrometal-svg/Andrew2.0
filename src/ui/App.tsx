import { useMemo, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { earthquakeRisk, socialEventRisk, type Signal } from '@analysis/probabilistic';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getRecentEarthquakes } from '@network/publicWeb';
import { findRelevantLessons, learnFromOutcome, learningStats } from '@core/learning';

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
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(createC33Brief(topic));
  const [quakeCount, setQuakeCount] = useState<number | null>(null);
  const [status, setStatus] = useState('Listo');
  const [projectId] = useState('iac33-main');
  const [lessonQuery, setLessonQuery] = useState('');
  const [learningVersion, setLearningVersion] = useState(0);
  const result = useMemo(() => domain === 'earthquake' ? earthquakeRisk(demoSignals) : socialEventRisk(demoSignals), [domain]);
  const critical = useMemo(() => assessEvidence(demoEvidence), []);
  const stats = useMemo(() => learningStats(projectId), [projectId, learningVersion]);
  const lessons = useMemo(() => lessonQuery.trim() ? findRelevantLessons(lessonQuery, projectId) : [], [lessonQuery, projectId, learningVersion]);

  async function updateNetwork() {
    setStatus('Consultando datos públicos…');
    try { const data = await getRecentEarthquakes(); setQuakeCount(data.features.length); setStatus('Red pública actualizada'); }
    catch { setStatus('No fue posible consultar la fuente'); }
  }

  function recordLearning() {
    try {
      learnFromOutcome({
        projectId,
        question: `${domain}: ${topic}`,
        observation: `Resultado con ${result.signals.length} señales y confianza ${result.confidence}.`,
        outcome: result.scenarios[0]?.label ?? 'Sin escenario principal',
        lesson: 'Las señales disponibles deben interpretarse como escenarios probabilísticos y contrastarse con nueva evidencia antes de elevar la confianza.',
        confidence: result.confidence === 'high' ? 0.8 : result.confidence === 'medium' ? 0.6 : 0.4,
      });
      setLearningVersion(v => v + 1);
      setStatus('Aprendizaje registrado en memoria local');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No fue posible registrar el aprendizaje');
    }
  }

  return <main style={{ maxWidth: 1050, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#0b0f14', color: '#e8edf2', minHeight: '100vh' }}>
    <h1>Andrew 2.0</h1><p>Pensador · visionario · análisis crítico · autonomía configurable</p>
    <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
      <article><h2>Red mundial pública</h2><p>Acceso web público: <b>ACTIVO</b></p><p>Datos satelitales públicos: <b>ACTIVOS</b></p><button onClick={updateNetwork}>Actualizar datos sísmicos</button>{quakeCount !== null && <p>Eventos recibidos: {quakeCount}</p>}<small>Andrew no controla satélites ni accede a redes privadas o restringidas.</small></article>
      <article><h2>Pronóstico</h2><button onClick={() => setDomain('earthquake')}>Riesgo sísmico</button>{' '}<button onClick={() => setDomain('social')}>Eventos sociales</button><p>Horizonte: {result.horizon} · Confianza: {result.confidence}</p><ol>{result.scenarios.map(s => <li key={s.label}>{s.label}: <strong>{Math.round(s.probability * 100)}%</strong></li>)}</ol><small>{result.warning}</small></article>
      <article><h2>Autonomía</h2><p>Nivel conceptual: <b>ASSISTED</b></p><ul>{defaultCapabilities.map(c => <li key={c.id}>{c.name}</li>)}</ul></article>
      <article><h2>Pensamiento crítico</h2><p>Confianza global: <strong>{critical.overallConfidence}</strong></p><p>Hechos: {critical.facts.length} · Contradicciones: {critical.contradictions.length} · Hipótesis: {critical.hypotheses.length}</p></article>
    </section>
    <section style={{ marginTop: 20 }}><h2>Memoria y aprendizaje</h2><p>Registros: <b>{stats.records}</b> · Memorias de aprendizaje: <b>{stats.learningMemories}</b> · Confianza media: <b>{Math.round(stats.averageConfidence * 100)}%</b></p><button onClick={recordLearning}>Registrar aprendizaje del análisis actual</button><div style={{ marginTop: 12 }}><input value={lessonQuery} onChange={e => setLessonQuery(e.target.value)} placeholder="Buscar aprendizajes…" style={{ width: '100%', padding: 10, boxSizing: 'border-box' }} />{lessons.length > 0 && <ul>{lessons.map(lesson => <li key={lesson.id}>{lesson.lesson} <small>({Math.round(lesson.confidence * 100)}%)</small></li>)}</ul>}</div></section>
    <section style={{ marginTop: 20 }}><h2>Expediente C33</h2><input value={topic} onChange={e => setTopic(e.target.value)} style={{ width: '100%', padding: 10, boxSizing: 'border-box' }} /><button style={{ marginTop: 8 }} onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button><h3>{brief.title}</h3><p><b>Hook:</b> {brief.hook}</p><p><b>Tesis:</b> {brief.thesis}</p><p><b>Contrapuntos:</b> {brief.counterpoints.join(' · ')}</p><p><b>Guion:</b> {brief.script}</p></section>
    <footer>{status}</footer>
  </main>;
}
