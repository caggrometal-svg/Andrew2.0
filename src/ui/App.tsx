import { useMemo, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getBridgeSessionId } from '@network/andrewBridge';
import { seismicPredictionEngine, type SeismicForecastResult } from '@/services/seismic/seismicEngine';
import AndrewChat from './AndrewChat';
import VideoGenerationPanel from './VideoGenerationPanel';
import './reengineering.css';

type Tab = 'andrew' | 'multimedia' | 'network' | 'seismic' | 'metrics' | 'settings';

const demoEvidence: Evidence[] = [
  { source: 'Fuente A', claim: 'Señal observada', reliability: 0.82 },
  { source: 'Fuente B', claim: 'Interpretación alternativa', reliability: 0.58, contradicts: ['Fuente A'] },
];

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'andrew', label: 'Andrew' },
  { id: 'multimedia', label: 'Multimedia' },
  { id: 'network', label: 'Red' },
  { id: 'seismic', label: 'Sismicidad' },
  { id: 'metrics', label: 'Métricas' },
  { id: 'settings', label: 'Configuración' },
];

function TabIcon({ id }: { id: Tab }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (id === 'andrew') return <svg {...common}><path d="M20 11.5a8.5 8.5 0 0 1-9 8.5 9.4 9.4 0 0 1-3.7-.8L4 20l.8-3.2A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/></svg>;
  if (id === 'multimedia') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg>;
  if (id === 'network') return <svg {...common}><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m7.2 11 9.4-4M7.2 13l9.4 4"/></svg>;
  if (id === 'seismic') return <svg {...common}><path d="m3 13 3-6 3 10 3-6 3 4 3-9 3 4"/></svg>;
  if (id === 'metrics') return <svg {...common}><path d="M4 19V5M10 19V9M16 19V3M22 19H2"/></svg>;
  return <svg {...common}><path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z"/><path d="m19.4 15 .6 1.2-2 2-.1-.1-1-.6-1.2.5-.4 1.3h-2.8l-.4-1.3-1.2-.5-1 .6-.1.1-2-2 .6-1.2-.5-1.2-1.3-.4V10l1.3-.4.5-1.2-.6-1.2 2-2 .1.1 1 .6 1.2-.5.4-1.3h2.8l.4 1.3 1.2.5 1-.6.1-.1 2 2-.6 1.2.5 1.2 1.3.4v2.8l-1.3.4-.5 1.2Z"/></svg>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('andrew');
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(() => createC33Brief('señales extrañas en el cielo'));
  const [forecast, setForecast] = useState<SeismicForecastResult | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [status, setStatus] = useState('Sistema preparado');
  const [conversationId] = useState(() => getBridgeSessionId());
  const critical = useMemo(() => assessEvidence(demoEvidence), []);

  async function updateSeismicData() {
    if (networkBusy) return;
    setNetworkBusy(true);
    setStatus('Consultando USGS y calculando actividad global + Chile…');
    try {
      const result = await seismicPredictionEngine.fetchAndComputeForecast(4.0);
      setForecast(result);
      setStatus(`USGS actualizado · ${result.chileEventsAnalyzed} eventos Chile ≥ M4.0`);
    } catch (error) {
      setStatus(error instanceof Error ? `USGS no disponible: ${error.message}` : 'USGS no disponible');
    } finally {
      setNetworkBusy(false);
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
            <div className="status-pill" aria-live="polite"><span className="status-dot" />{status}</div>
          </div>
        </header>

        <section className="surface workspace-panel" role="tabpanel" aria-label={tabs.find(item => item.id === tab)?.label ?? 'Andrew'}>
          {tab === 'andrew' && <AndrewChat conversationId={conversationId} />}
          {tab === 'multimedia' && <VideoGenerationPanel conversationId={conversationId} contextText="Andrew 2.0 multimedia workspace" onStatus={setStatus} />}
          {tab === 'network' && <div className="tab-panel"><h2>Red</h2><p className="muted">Conectividad y fuentes públicas autorizadas.</p><div className="metric-list"><div><span>Bridge</span><strong>Disponible según runtime</strong></div><div><span>Fuente sísmica</span><strong>USGS GeoJSON</strong></div><div><span>Red privada</span><strong>Bloqueada</strong></div></div><button className="ui-button" type="button" disabled={networkBusy} onClick={() => void updateSeismicData()}>{networkBusy ? 'Consultando…' : 'Probar red pública'}</button></div>}
          {tab === 'seismic' && <div className="tab-panel seismic-panel"><div className="panel-heading-row"><div><h2>Motor de Pronóstico Sísmico</h2><p className="muted">Modelo estadístico dinámico basado en actividad USGS. No constituye predicción determinista ni alerta oficial.</p></div><span className="source-badge">USGS</span></div><div className="metric-list"><div><span>Eventos globales analizados</span><strong>{forecast?.totalEventsAnalyzed ?? '—'}</strong></div><div><span>Eventos Chile ≥ M4.0</span><strong>{forecast?.chileEventsAnalyzed ?? '—'}</strong></div><div><span>Probabilidad global ≥ M4.0 / 14 días</span><strong>{forecast ? `${forecast.probabilityNext14Days}%` : '—'}</strong></div><div><span>Probabilidad global ≥ M4.0 / 30 días</span><strong>{forecast ? `${forecast.probabilityNext30Days}%` : '—'}</strong></div></div><div className="local-seismic"><div className="local-seismic-heading"><div><h3>Chile · últimos eventos</h3><p className="muted">Hora local · coordenadas USGS · profundidad.</p></div></div>{forecast?.chileLatestEvents.length ? <div className="seismic-event-list">{forecast.chileLatestEvents.map(event => <article className="seismic-event" key={event.id}><div><strong>M{event.magnitude.toFixed(1)}</strong><span>{event.localTime}</span></div><p>{event.place}</p><small>{event.coordinates[1].toFixed(4)}°, {event.coordinates[0].toFixed(4)}° · {event.coordinates[2].toFixed(1)} km</small></article>)}</div> : <p className="muted">Actualiza USGS para cargar el detalle local.</p>}</div><button className="ui-button" type="button" disabled={networkBusy} onClick={() => void updateSeismicData()}>{networkBusy ? 'Analizando…' : 'Actualizar y recalcular'}</button></div>}
          {tab === 'metrics' && <div className="tab-panel"><div className="panel-heading-row"><div><h2>Métricas</h2><p className="muted">Indicadores de pensamiento crítico y estado del sistema.</p></div><span className="source-badge">Local-first</span></div><div className="metric-list"><div><span>Hechos evaluados</span><strong>{critical.facts.length}</strong></div><div><span>Contradicciones</span><strong>{critical.contradictions.length}</strong></div><div><span>Hipótesis</span><strong>{critical.hypotheses.length}</strong></div><div><span>Confianza global</span><strong>{critical.overallConfidence}</strong></div></div><div className="c33-metrics"><span className="eyebrow">IAC33 · Casos</span><h3>Expediente C33</h3><input className="text-input" value={topic} onChange={event => setTopic(event.target.value)} aria-label="Tema del expediente" /><button className="ui-button" type="button" onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button><p><strong>{brief.title}</strong></p><p className="muted">{brief.hook}</p></div><h3>Capacidades</h3><ul>{defaultCapabilities.map(capability => <li key={capability.id}>{capability.name}</li>)}</ul></div>}
          {tab === 'settings' && <div className="tab-panel"><h2>Configuración</h2><p className="muted">Interfaz fijada en Strict Dark Mode para uso móvil.</p><div className="metric-list"><div><span>Tema</span><strong>Strict Dark</strong></div><div><span>Viewport</span><strong>100dvh</strong></div><div><span>Chat</span><strong>Scroll independiente</strong></div><div><span>Bridge</span><strong>Persistente</strong></div></div><div className="notice">El esquema claro está deshabilitado en la interfaz de producción.</div></div>}
        </section>

        <nav className="bottom-nav" aria-label="Navegación principal">
          {tabs.map(item => <button key={item.id} className={`nav-item${tab === item.id ? ' is-active' : ''}`} type="button" aria-current={tab === item.id ? 'page' : undefined} aria-label={item.label} onClick={() => setTab(item.id)}><TabIcon id={item.id} /><span>{item.label}</span><i className="nav-indicator" /></button>)}
        </nav>
      </div>
    </main>
  );
}
