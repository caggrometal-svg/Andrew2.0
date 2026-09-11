import { useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getRecentEarthquakes } from '@network/publicWeb';
import { getBridgeSessionId } from '@network/andrewBridge';
import AndrewChat from './AndrewChat';
import VideoGenerationPanel from './VideoGenerationPanel';
import './styles.css';
import './reengineering.css';

const demoEvidence: Evidence[] = [
  { source: 'Fuente A', claim: 'Señal observada', reliability: 0.82 },
  { source: 'Fuente B', claim: 'Interpretación alternativa', reliability: 0.58, contradicts: ['Fuente A'] },
];

type Tab = 'andrew' | 'multimedia' | 'network' | 'seismic' | 'metrics' | 'settings';
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'andrew', label: 'Andrew' }, { id: 'multimedia', label: 'Multimedia' }, { id: 'network', label: 'Red' },
  { id: 'seismic', label: 'Sismicidad' }, { id: 'metrics', label: 'Métricas' }, { id: 'settings', label: 'Configuración' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('andrew');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('andrew:theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(createC33Brief(topic));
  const [quakeCount, setQuakeCount] = useState<number | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [status, setStatus] = useState('Sistema preparado');
  const [conversationId] = useState(() => getBridgeSessionId());
  const critical = assessEvidence(demoEvidence);

  function changeTheme(next: 'dark' | 'light') {
    setTheme(next);
    try { localStorage.setItem('andrew:theme', next); } catch { /* best effort */ }
  }

  async function updateNetwork() {
    if (networkBusy) return;
    setNetworkBusy(true);
    setStatus('Sincronizando datos públicos…');
    try {
      const data = await getRecentEarthquakes();
      setQuakeCount(data.features.length);
      setStatus('Red pública actualizada');
    } catch {
      setStatus('Fuente pública no disponible; no se muestran datos inventados');
    } finally { setNetworkBusy(false); }
  }

  return (
    <main className="app-page" data-theme={theme}>
      <div className="app-shell">
        <header className="surface app-header">
          <div className="app-header-main">
            <div className="brand-block"><div className="eyebrow">IAC33 · Neural Runtime</div><h1>Andrew 2.0</h1><p>Asistente personal · análisis · memoria · creación multimedia</p></div>
            <div className="status-pill" aria-live="polite">{status}</div>
          </div>
        </header>

        <nav className="surface mode-bar" aria-label="Secciones de Andrew 2.0" role="tablist">
          {tabs.map(item => <button key={item.id} className={`mode-button${tab === item.id ? ' is-active' : ''}`} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </nav>

        <section className="surface workspace-panel" role="tabpanel">
          {tab === 'andrew' && <AndrewChat conversationId={conversationId} />}
          {tab === 'multimedia' && <VideoGenerationPanel conversationId={conversationId} contextText="Andrew 2.0 multimedia workspace" onStatus={setStatus} />}
          {tab === 'network' && <div className="tab-panel"><h2>Red</h2><p className="muted">Las fuentes públicas solo se consultan cuando se solicita actualización.</p><button className="ui-button" type="button" disabled={networkBusy} onClick={() => void updateNetwork()}>{networkBusy ? 'Consultando…' : 'Actualizar datos públicos'}</button><div className="metric-list"><div><span>Acceso web</span><strong>Disponible</strong></div><div><span>Eventos sísmicos recibidos</span><strong>{quakeCount ?? '—'}</strong></div></div></div>}
          {tab === 'seismic' && <div className="tab-panel"><h2>Estimación Experimental</h2><div className="notice">No existe actualmente un motor predictivo sísmico validado conectado al backend. Andrew no presentará porcentajes de predicción como hechos.</div><div className="metric-list"><div><span>Datos sísmicos públicos</span><strong>{quakeCount === null ? 'No consultados' : `${quakeCount} eventos`}</strong></div><div><span>Horizonte predictivo</span><strong>No disponible</strong></div><div><span>Probabilidad de terremoto</span><strong>No calculada</strong></div><div><span>Estado científico</span><strong>Experimental</strong></div></div><p className="muted">Trazabilidad requerida: fuente → ingestión → normalización → características → modelo → calibración → incertidumbre.</p><button className="ui-button" type="button" disabled={networkBusy} onClick={() => void updateNetwork()}>{networkBusy ? 'Actualizando…' : 'Actualizar datos de entrada'}</button></div>}
          {tab === 'metrics' && <div className="tab-panel"><h2>Métricas</h2><div className="metric-list"><div><span>Hechos evaluados</span><strong>{critical.facts.length}</strong></div><div><span>Contradicciones</span><strong>{critical.contradictions.length}</strong></div><div><span>Hipótesis</span><strong>{critical.hypotheses.length}</strong></div><div><span>Confianza global</span><strong>{critical.overallConfidence}</strong></div></div><p className="muted">Estas métricas proceden del motor local de evaluación; no se presentan como telemetría externa.</p></div>}
          {tab === 'settings' && <div className="tab-panel"><h2>Configuración</h2><div className="metric-list"><div><span>Persistencia</span><strong>Local + backend</strong></div><div><span>Bridge Android</span><strong>Disponible según runtime</strong></div><div><span>Multimedia</span><strong>Cola asíncrona de proveedor</strong></div><div><span>Autonomía</span><strong>ASSISTED</strong></div></div><h3>Tema</h3><div className="button-row"><button className={`ui-button${theme === 'dark' ? ' is-selected' : ''}`} type="button" onClick={() => changeTheme('dark')}>Oscuro</button><button className={`ui-button${theme === 'light' ? ' is-selected' : ''}`} type="button" onClick={() => changeTheme('light')}>Claro</button></div><h3>Capacidades declaradas</h3><ul>{defaultCapabilities.map(c => <li key={c.id}>{c.name}</li>)}</ul></div>}
        </section>

        <section className="surface c33-panel"><h2>Expediente C33</h2><div className="c33-input-row"><input className="text-input" value={topic} onChange={e => setTopic(e.target.value)} aria-label="Tema del expediente" /><button className="ui-button" type="button" onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button></div><h3>{brief.title}</h3><p><b>Hook:</b> {brief.hook}</p><p><b>Tesis:</b> {brief.thesis}</p><p><b>Contrapuntos:</b> {brief.counterpoints.join(' · ')}</p><p><b>Guion:</b> {brief.script}</p></section>
      </div>
    </main>
  );
}
