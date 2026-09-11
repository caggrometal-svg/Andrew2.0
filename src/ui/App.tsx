import { useMemo, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { earthquakeRisk, socialEventRisk, type Signal } from '@analysis/probabilistic';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getRecentEarthquakes } from '@network/publicWeb';
import { getBridgeSessionId } from '@network/andrewBridge';
import AndrewChat from './AndrewChat';
import VideoGenerationPanel from './VideoGenerationPanel';
import './styles.css';

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

type Tab = 'chat' | 'video';

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');
  const [domain, setDomain] = useState<'earthquake' | 'social'>('earthquake');
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(createC33Brief(topic));
  const [quakeCount, setQuakeCount] = useState<number | null>(null);
  const [status, setStatus] = useState('Listo · sistema preparado');
  const [conversationId] = useState(() => getBridgeSessionId());
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

  return (
    <main className="app-page">
      <div className="app-shell">
        <header className="surface app-header">
          <div className="app-header-main">
            <div className="brand-block">
              <div className="eyebrow">IAC33 · Neural Runtime</div>
              <h1>Andrew 2.0</h1>
              <p>Asistente personal · análisis · memoria · creación multimedia</p>
            </div>
            <div className="status-pill" aria-live="polite">{status}</div>
          </div>
        </header>

        <nav className="surface mode-bar" aria-label="Andrew 2.0">
          <button className={`mode-button${tab === 'chat' ? ' is-active' : ''}`} type="button" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Andrew Chat</button>
          <button className={`mode-button${tab === 'video' ? ' is-active' : ''}`} type="button" aria-selected={tab === 'video'} onClick={() => setTab('video')}>Multimedia / Video</button>
        </nav>

        <section className="surface workspace-panel">
          {tab === 'chat' ? <AndrewChat conversationId={conversationId} /> : <VideoGenerationPanel conversationId={conversationId} contextText="Andrew 2.0 multimedia workspace" onStatus={setStatus} />}
        </section>

        <section className="dashboard-grid">
          <article className="surface info-card">
            <h2>Red mundial pública</h2>
            <p className="muted">Acceso web público: <b>ACTIVO</b></p>
            <p className="muted">Datos sísmicos públicos: <b>ACTIVOS</b></p>
            <button className="ui-button" onClick={() => void updateNetwork()}>Actualizar datos sísmicos</button>
            {quakeCount !== null && <p>Eventos recibidos: {quakeCount}</p>}
          </article>

          <article className="surface info-card">
            <h2>Pronóstico</h2>
            <div className="button-row">
              <button className={`ui-button${domain === 'earthquake' ? ' is-selected' : ''}`} onClick={() => setDomain('earthquake')}>Riesgo sísmico</button>
              <button className={`ui-button${domain === 'social' ? ' is-selected' : ''}`} onClick={() => setDomain('social')}>Eventos sociales</button>
            </div>
            <p>Horizonte: {result.horizon} · Confianza: {result.confidence}</p>
            <ol>{result.scenarios.map(s => <li key={s.label}>{s.label}: <strong>{Math.round(s.probability * 100)}%</strong></li>)}</ol>
            <small className="muted">{result.warning}</small>
          </article>

          <article className="surface info-card">
            <h2>Autonomía</h2>
            <p className="muted">Nivel: <b>ASSISTED</b></p>
            <ul>{defaultCapabilities.map(c => <li key={c.id}>{c.name}</li>)}</ul>
          </article>

          <article className="surface info-card">
            <h2>Pensamiento crítico</h2>
            <p>Confianza global: <strong>{critical.overallConfidence}</strong></p>
            <p className="muted">Hechos: {critical.facts.length} · Contradicciones: {critical.contradictions.length} · Hipótesis: {critical.hypotheses.length}</p>
          </article>
        </section>

        <section className="surface c33-panel">
          <h2>Expediente C33</h2>
          <input className="text-input" value={topic} onChange={e => setTopic(e.target.value)} />
          <button className="ui-button c33-action" onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button>
          <h3>{brief.title}</h3>
          <p><b>Hook:</b> {brief.hook}</p>
          <p><b>Tesis:</b> {brief.thesis}</p>
          <p><b>Contrapuntos:</b> {brief.counterpoints.join(' · ')}</p>
          <p><b>Guion:</b> {brief.script}</p>
        </section>
      </div>
    </main>
  );
}
