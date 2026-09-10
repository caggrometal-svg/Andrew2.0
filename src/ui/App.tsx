import { useMemo, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { earthquakeRisk, socialEventRisk, type Signal } from '@analysis/probabilistic';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getRecentEarthquakes } from '@network/publicWeb';
import AndrewChat from './AndrewChat';
import VideoGenerationPanel from './VideoGenerationPanel';

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

const styles = {
  page: { minHeight: '100vh', background: 'radial-gradient(circle at 20% 0%, #162338 0, #090d13 42%, #06080c 100%)', color: '#edf3f8', fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: 'max(16px, env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))', boxSizing: 'border-box' },
  shell: { maxWidth: 1180, margin: '0 auto' },
  card: { background: 'rgba(14,20,29,.82)', border: '1px solid rgba(126,155,185,.18)', borderRadius: 20, boxShadow: '0 18px 50px rgba(0,0,0,.28)', backdropFilter: 'blur(18px)' },
  muted: { color: '#8e9dad' },
  button: { border: '1px solid #2b4057', background: '#162333', color: '#eaf3fb', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', touchAction: 'manipulation', minHeight: 44 },
} as const;

type Tab = 'chat' | 'video';

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [domain, setDomain] = useState<'earthquake' | 'social'>('earthquake');
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(createC33Brief(topic));
  const [quakeCount, setQuakeCount] = useState<number | null>(null);
  const [status, setStatus] = useState('Listo · sistema preparado');
  const [conversationId] = useState(() => crypto.randomUUID());
  const result = useMemo(() => domain === 'earthquake' ? earthquakeRisk(demoSignals) : socialEventRisk(demoSignals), [domain]);
  const critical = useMemo(() => assessEvidence(demoEvidence), []);

  async function updateNetwork() {
    setStatus('Sincronizando datos públicos…');
    try {
      const data = await getRecentEarthquakes();
      setQuakeCount(data.features.length);
      setStatus('Red pública actualizada');
    } catch {
      setStatus('No fue posible consultar la fuente');
    }
  }

  return <main style={styles.page}>
    <div style={styles.shell}>
      <header style={{ ...styles.card, padding: 24, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#6f9ac2' }}>IAC33 · Neural Runtime</div><h1 style={{ margin: '7px 0 4px', fontSize: 32 }}>Andrew 2.0</h1><p style={{ ...styles.muted, margin: 0 }}>Asistente personal · análisis · memoria · creación multimedia</p></div>
          <div aria-live="polite" style={{ padding: '10px 14px', borderRadius: 14, background: '#11251f', border: '1px solid rgba(113,180,155,.2)', fontSize: 13 }}>{status}</div>
        </div>
      </header>

      <nav style={{ ...styles.card, padding: 8, marginBottom: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} aria-label="Andrew 2.0">
        <button type="button" aria-selected={tab === 'chat'} onClick={() => setTab('chat')} style={{ ...styles.button, background: tab === 'chat' ? '#214c72' : '#101923', fontWeight: tab === 'chat' ? 700 : 500 }}>Andrew Chat</button>
        <button type="button" aria-selected={tab === 'video'} onClick={() => setTab('video')} style={{ ...styles.button, background: tab === 'video' ? '#214c72' : '#101923', fontWeight: tab === 'video' ? 700 : 500 }}>Multimedia / Video</button>
      </nav>

      <section style={{ ...styles.card, padding: 20, marginBottom: 18 }}>
        {tab === 'chat' ? <AndrewChat conversationId={conversationId} /> : <VideoGenerationPanel conversationId={conversationId} contextText="Andrew 2.0 multimedia workspace" onStatus={setStatus} />}
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <article style={{ ...styles.card, padding: 18 }}><h2>Red mundial pública</h2><p style={styles.muted}>Acceso web público: <b>ACTIVO</b></p><p style={styles.muted}>Datos sísmicos públicos: <b>ACTIVOS</b></p><button style={styles.button} onClick={() => void updateNetwork()}>Actualizar datos sísmicos</button>{quakeCount !== null && <p>Eventos recibidos: {quakeCount}</p>}</article>
        <article style={{ ...styles.card, padding: 18 }}><h2>Pronóstico</h2><button style={styles.button} onClick={() => setDomain('earthquake')}>Riesgo sísmico</button>{' '}<button style={styles.button} onClick={() => setDomain('social')}>Eventos sociales</button><p>Horizonte: {result.horizon} · Confianza: {result.confidence}</p><ol>{result.scenarios.map(s => <li key={s.label}>{s.label}: <strong>{Math.round(s.probability * 100)}%</strong></li>)}</ol><small style={styles.muted}>{result.warning}</small></article>
        <article style={{ ...styles.card, padding: 18 }}><h2>Autonomía</h2><p style={styles.muted}>Nivel: <b>ASSISTED</b></p><ul>{defaultCapabilities.map(c => <li key={c.id}>{c.name}</li>)}</ul></article>
        <article style={{ ...styles.card, padding: 18 }}><h2>Pensamiento crítico</h2><p>Confianza global: <strong>{critical.overallConfidence}</strong></p><p style={styles.muted}>Hechos: {critical.facts.length} · Contradicciones: {critical.contradictions.length} · Hipótesis: {critical.hypotheses.length}</p></article>
      </section>

      <section style={{ ...styles.card, padding: 20, marginTop: 16 }}><h2>Expediente C33</h2><input value={topic} onChange={e => setTopic(e.target.value)} style={{ width: '100%', padding: 12, boxSizing: 'border-box', color: '#edf3f8', background: '#0a1018', border: '1px solid #26394d', borderRadius: 12, fontSize: 16 }} /><button style={{ ...styles.button, marginTop: 9 }} onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button><h3>{brief.title}</h3><p><b>Hook:</b> {brief.hook}</p><p><b>Tesis:</b> {brief.thesis}</p><p><b>Contrapuntos:</b> {brief.counterpoints.join(' · ')}</p><p><b>Guion:</b> {brief.script}</p></section>
    </div>
  </main>;
}
