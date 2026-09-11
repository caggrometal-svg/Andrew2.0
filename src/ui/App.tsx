import { useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getBridgeSessionId } from '@network/andrewBridge';
import { seismicPredictionEngine, type SeismicForecastResult } from '@/services/seismic/seismicEngine';
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
  const [forecast, setForecast] = useState<SeismicForecastResult | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [status, setStatus] = useState('Sistema preparado');
  const [conversationId] = useState(() => getBridgeSessionId());
  const critical = assessEvidence(demoEvidence);

  function changeTheme(next: 'dark' | 'light') {
    setTheme(next);
    try { localStorage.setItem('andrew:theme', next); } catch { /* best effort */ }
  }

  async function updateSeismicData() {
    if (networkBusy) return;
    setNetworkBusy(true);
    setStatus('Consultando USGS y calculando ventana de 30 días…');
    try {
      const result = await seismicPredictionEngine.fetchAndComputeForecast(4.0);
      setForecast(result);
      setStatus('USGS actualizado · análisis estadístico completado');
    } catch (error) {
      setStatus(error instanceof Error ? `USGS no disponible: ${error.message}` : 'USGS no disponible');
    } finally {
      setNetworkBusy(false);
    }
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
          {tab === 'network' && <div className="tab-panel"><h2>Red</h2><p className="muted">Las fuentes públicas se consultan bajo demanda.</p><button className="ui-button" type="button" disabled={networkBusy} onClick={() => void updateSeismicData()}>{networkBusy ? 'Consultando…' : 'Actualizar datos sísmicos USGS'}</button><div className="metric-list"><div><span>Fuente</span><strong>USGS GeoJSON</strong></div><div><span>Eventos ≥ M4.0 / 30 días</span><strong>{forecast?.totalEventsAnalyzed ?? '—'}</strong></div></div></div>}
          {tab === 'seismic' && <div className="tab-panel"><h2>Motor de Pronóstico Sísmico</h2><div className="notice">Modelo estadístico dinámico: frecuencia observada de los últimos 30 días + proceso de Poisson para la probabilidad de al menos un evento ≥ M4.0 + relación Gutenberg-Richter para estimar la mediana del máximo esperado. No constituye predicción determinista ni alerta oficial.</div><div className="metric-list"><div><span>Eventos analizados</span><strong>{forecast?.totalEventsAnalyzed ?? '—'}</strong></div><div><span>Probabilidad ≥ M4.0 próximos 14 días</span><strong>{forecast ? `${forecast.probabilityNext14Days}%` : '—'}</strong></div><div><span>Probabilidad ≥ M4.0 próximos 30 días</span><strong>{forecast ? `${forecast.probabilityNext30Days}%` : '—'}</strong></div><div><span>Mediana del máximo esperado</span><strong>{forecast ? `M${forecast.highestRiskMagnitudeExpected.toFixed(1)}` : '—'}</strong></div><div><span>Anomalía de tasa 7d vs 23d</span><strong>{forecast ? (forecast.activeAnomaliesDetected ? 'Detectada' : 'No detectada') : '—'}</strong></div><div><span>Última actualización</span><strong>{forecast ? new Date(forecast.lastUpdated).toLocaleString() : '—'}</strong></div></div><p className="muted">Fuente: {forecast?.dataSource ?? 'USGS Earthquake Hazards Program · all_month.geojson'}</p><button className="ui-button" type="button" disabled={networkBusy} onClick={() => void updateSeismicData()}>{networkBusy ? 'Analizando…' : 'Actualizar y recalcular'}</button></div>}
          {tab === 'metrics' && <div className="tab-panel"><h2>Métricas</h2><div className="metric-list"><div><span>Hechos evaluados</span><strong>{critical.facts.length}</strong></div><div><span>Contradicciones</span><strong>{critical.contradictions.length}</strong></div><div><span>Hipótesis</span><strong>{critical.hypotheses.length}</strong></div><div><span>Confianza global</span><strong>{critical.overallConfidence}</strong></div></div><p className="muted">Estas métricas proceden del motor local de evaluación; no se presentan como telemetría externa.</p></div>}
          {tab === 'settings' && <div className="tab-panel"><h2>Configuración</h2><div className="metric-list"><div><span>Persistencia</span><strong>Local + backend</strong></div><div><span>Bridge Android</span><strong>Disponible según runtime</strong></div><div><span>Multimedia</span><strong>Cola asíncrona de proveedor</strong></div><div><span>Autonomía</span><strong>ASSISTED</strong></div></div><h3>Tema</h3><div className="button-row"><button className={`ui-button${theme === 'dark' ? ' is-selected' : ''}`} type="button" onClick={() => changeTheme('dark')}>Oscuro</button><button className={`ui-button${theme === 'light' ? ' is-selected' : ''}`} type="button" onClick={() => changeTheme('light')}>Claro</button></div><h3>Capacidades declaradas</h3><ul>{defaultCapabilities.map(c => <li key={c.id}>{c.name}</li>)}</ul></div>}
        </section>

        <section className="surface c33-panel"><h2>Expediente C33</h2><div className="c33-input-row"><input className="text-input" value={topic} onChange={e => setTopic(e.target.value)} aria-label="Tema del expediente" /><button className="ui-button" type="button" onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button></div><h3>{brief.title}</h3><p><b>Hook:</b> {brief.hook}</p><p><b>Tesis:</b> {brief.thesis}</p><p><b>Contrapuntos:</b> {brief.counterpoints.join(' · ')}</p><p><b>Guion:</b> {brief.script}</p></section>
      </div>
    </main>
  );
}
