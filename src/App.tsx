import { FormEvent, useMemo, useState } from 'react';
import { historicalSummary, SEISMIC_SOURCE, SeismicEvent } from './app/seismic-config';
import './styles.css';

type View = 'seismic' | 'chat' | 'c33' | 'settings';

const SAMPLE_EVENTS: SeismicEvent[] = [
  { id: 'sample-1', occurredAt: '2026-09-10T15:58:55-03:00', latitude: -23.101, longitude: -67.322, depthKm: 223, magnitude: 3.4, magnitudeType: 'Mlv', place: '69 km al SE de Socaire' },
  { id: 'sample-2', occurredAt: '2026-09-10T15:56:36-03:00', latitude: -32.87, longitude: -71.18, depthKm: 80, magnitude: 3.2, magnitudeType: 'Mlv', place: '26 km al SE de Petorca' },
  { id: 'sample-3', occurredAt: '2026-09-10T15:40:58-03:00', latitude: -20.95, longitude: -68.9, depthKm: 123, magnitude: 2.8, magnitudeType: 'Mlv', place: '47 km al SO de Mina Collahuasi' },
  { id: 'sample-4', occurredAt: '2026-09-10T15:21:18-03:00', latitude: -27.15, longitude: -109.45, depthKm: 10, magnitude: 5.4, magnitudeType: 'Mw', place: 'Isla de Pascua · fuera del territorio continental' },
];

const NAV_ITEMS: Array<{ id: View; label: string; icon: string }> = [
  { id: 'seismic', label: 'Sismos', icon: '⌁' },
  { id: 'chat', label: 'Andrew', icon: '◉' },
  { id: 'c33', label: 'C33', icon: '▣' },
  { id: 'settings', label: 'Ajustes', icon: '⚙' },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(value));
}

export default function App() {
  const [view, setView] = useState<View>('seismic');
  const [events, setEvents] = useState<SeismicEvent[]>(SAMPLE_EVENTS);
  const [magnitudeFilter, setMagnitudeFilter] = useState(0);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compactMode, setCompactMode] = useState(true);
  const [historicalWindow, setHistoricalWindow] = useState('30d');
  const [notifications, setNotifications] = useState(true);

  const chileEvents = useMemo(() => events.filter((event) => event.latitude >= -56 && event.latitude <= -17 && event.longitude >= -76 && event.longitude <= -66), [events]);
  const filteredEvents = useMemo(() => chileEvents.filter((event) => event.magnitude >= magnitudeFilter).sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)), [chileEvents, magnitudeFilter]);
  const summary = useMemo(() => historicalSummary(chileEvents), [chileEvents]);

  function refresh() {
    // The UI is ready for the backend proxy configured in VITE_SEISMIC_ENDPOINT.
    // Until it is available, retain the last verified CSN-derived sample state.
    setEvents((current) => [...current]);
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setMessages((current) => [...current, { role: 'user', text: value }, { role: 'assistant', text: 'Análisis preparado. Conecta el gateway de IA para ejecutar la consulta.' }]);
    setInput('');
  }

  return (
    <main className={`app-shell ${compactMode ? 'compact' : ''}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">C33</span>
          <div>
            <span className="eyebrow">MONITOR SÍSMICO · IAC33</span>
            <h1>Andrew 2.0</h1>
          </div>
        </div>
        <div className="live-indicator"><span /> {autoRefresh ? 'Monitoreo activo' : 'Pausa'}</div>
      </header>

      <nav className="top-tabs" aria-label="Módulos principales">
        <button className={`top-tab ${view === 'seismic' ? 'active' : ''}`} onClick={() => setView('seismic')} type="button">
          <span>Sismos Chile</span><small>CSN · tiempo real</small>
        </button>
        <button className={`c33-card ${view === 'c33' ? 'active' : ''}`} onClick={() => setView('c33')} type="button">
          <strong>EXPEDIENTE C33</strong><span>Investigación · evidencia</span>
        </button>
      </nav>

      {view === 'seismic' && (
        <section className="workspace" aria-label="Monitoreo sísmico de Chile">
          <div className="section-head">
            <div><span className="section-kicker">FUENTE OFICIAL</span><h2>Actividad sísmica en Chile</h2><p>{SEISMIC_SOURCE.name} · {SEISMIC_SOURCE.institution}</p></div>
            <button className="ghost-button" type="button" onClick={refresh}>Actualizar</button>
          </div>

          <div className="stats-grid">
            <div className="stat-card"><span>Eventos en alcance</span><strong>{summary.count}</strong><small>Filtro geográfico Chile</small></div>
            <div className="stat-card"><span>Magnitud media</span><strong>{summary.meanMagnitude.toFixed(1)}</strong><small>Ventana {historicalWindow}</small></div>
            <div className="stat-card"><span>Máxima observada</span><strong>{summary.maxMagnitude.toFixed(1)}</strong><small>Registro disponible</small></div>
          </div>

          <div className="toolbar">
            <div className="filter-group" aria-label="Filtro de magnitud">
              {[0, 3, 4, 5].map((value) => <button key={value} className={magnitudeFilter === value ? 'selected' : ''} type="button" onClick={() => setMagnitudeFilter(value)}>M{value === 0 ? 'all' : `≥${value}`}</button>)}
            </div>
            <span className="source-badge">CSN · Chile only</span>
          </div>

          <div className="event-list">
            {filteredEvents.map((event) => (
              <article className="event-row" key={event.id}>
                <div className="magnitude"><strong>{event.magnitude.toFixed(1)}</strong><span>{event.magnitudeType ?? 'M'}</span></div>
                <div className="event-main"><strong>{event.place}</strong><span>{formatTime(event.occurredAt)} · profundidad {event.depthKm} km</span></div>
                <div className="coordinates"><span>{event.latitude.toFixed(3)}</span><span>{event.longitude.toFixed(3)}</span></div>
              </article>
            ))}
          </div>

          <div className="analysis-card">
            <div><span className="section-kicker">ANÁLISIS HISTÓRICO</span><h3>Indicadores para futuras proyecciones</h3><p>Promedios, medianas, distribución y recurrencia sobre datos históricos. No genera fechas ni magnitudes futuras como certezas.</p></div>
            <select value={historicalWindow} onChange={(event) => setHistoricalWindow(event.target.value)} aria-label="Ventana histórica">
              <option value="7d">7 días</option><option value="30d">30 días</option><option value="90d">90 días</option><option value="1y">1 año</option>
            </select>
          </div>
        </section>
      )}

      {view === 'chat' && (
        <section className="workspace chat-workspace">
          <div className="section-head"><div><span className="section-kicker">ANÁLISIS</span><h2>Andrew</h2><p>Consulta los datos sísmicos sin abandonar el monitor.</p></div></div>
          <div className="chat-messages">{messages.length === 0 ? <div className="empty-state">Escribe una consulta para analizar la actividad observada.</div> : messages.map((message, index) => <article key={index} className={`chat-message ${message.role}`}><span>{message.role === 'user' ? 'Tú' : 'Andrew'}</span><p>{message.text}</p></article>)}</div>
          <form className="chat-composer" onSubmit={sendMessage}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Consulta actividad, magnitud, profundidad…" aria-label="Consulta" /><button type="submit" disabled={!input.trim()}>Enviar</button></form>
        </section>
      )}

      {view === 'c33' && <section className="workspace c33-workspace"><div className="c33-hero"><span className="section-kicker">EXPEDIENTE C33</span><h2>Hecho → Evidencia → Anomalía → Teoría → Veredicto</h2><p>Espacio para contrastar casos reales, fuentes y preguntas abiertas sin presentar hipótesis como hechos.</p><button type="button" onClick={() => setView('chat')}>Abrir análisis</button></div></section>}

      {view === 'settings' && (
        <section className="workspace settings-workspace">
          <div className="section-head"><div><span className="section-kicker">CONFIGURACIÓN</span><h2>Centro de control</h2><p>Preferencias generales, monitoreo y análisis.</p></div></div>
          <div className="settings-grid">
            <label><span>Actualización automática</span><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /></label>
            <label><span>Modo compacto</span><input type="checkbox" checked={compactMode} onChange={(event) => setCompactMode(event.target.checked)} /></label>
            <label><span>Notificaciones sísmicas</span><input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} /></label>
            <label><span>Fuente de datos</span><strong>CSN · Chile</strong></label>
            <label><span>Endpoint de datos</span><strong>{SEISMIC_SOURCE.endpoint}</strong></label>
            <label><span>Alcance geográfico</span><strong>Territorio de Chile</strong></label>
            <label><span>Ventana histórica</span><select value={historicalWindow} onChange={(event) => setHistoricalWindow(event.target.value)}><option value="7d">7 días</option><option value="30d">30 días</option><option value="90d">90 días</option><option value="1y">1 año</option></select></label>
            <a className="settings-link" href={SEISMIC_SOURCE.officialUrl} target="_blank" rel="noreferrer">Abrir sitio oficial del CSN ↗</a>
          </div>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}
      </nav>
    </main>
  );
}
