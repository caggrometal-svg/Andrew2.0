import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { earthquakeRisk, socialEventRisk, type Signal } from '@analysis/probabilistic';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { findRelevantLessons, learnFromOutcome, learningStats } from '@core/learning';
import {
  checkAndrewBackend,
  sendAndrewMessage,
  uploadVideoInChunks,
  type AndrewChatResponse,
  type NetworkStatus,
} from '@network/andrewBackend';
import { getRecentEarthquakes } from '@network/publicWeb';
import './StrictDark.css';

type TabId = 'chat' | 'media' | 'network' | 'seismicity' | 'metrics' | 'settings';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

const CHAT_STORAGE_KEY = 'andrew:ui:chat:v2';
const CONVERSATION_ID_KEY = 'andrew:ui:conversation:v2';
const USER_NAME_KEY = 'andrew:user-name';

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

const tabs: Array<{ id: TabId; label: string; subtitle: string }> = [
  { id: 'chat', label: 'Andrew', subtitle: 'Chat' },
  { id: 'media', label: 'Multimedia', subtitle: 'Video' },
  { id: 'network', label: 'Red', subtitle: 'Internet' },
  { id: 'seismicity', label: 'Sismicidad', subtitle: 'Eventos' },
  { id: 'metrics', label: 'Métricas', subtitle: 'Sistema' },
  { id: 'settings', label: 'Config.', subtitle: 'Ajustes' },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'chat') return <svg {...common}><path d="M20 11.5a8.5 8.5 0 0 1-9 8.5 9.4 9.4 0 0 1-3.7-.8L4 20l.8-3.2A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"/></svg>;
  if (name === 'media') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m9 9 6 3-6 3V9Z"/><path d="M7 4v-1M17 4v-1"/></svg>;
  if (name === 'network') return <svg {...common}><circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m7.2 11 9.4-4M7.2 13l9.4 4"/></svg>;
  if (name === 'seismicity') return <svg {...common}><path d="m3 13 3-6 3 10 3-6 3 4 3-9 3 4"/></svg>;
  if (name === 'metrics') return <svg {...common}><path d="M4 19V5M10 19V9M16 19V3M22 19H2"/></svg>;
  if (name === 'settings') return <svg {...common}><path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z"/><path d="m19.4 15 .6 1.2-2 2-.1-.1-1-.6-1.2.5-.4 1.3h-2.8l-.4-1.3-1.2-.5-1 .6-.1.1-2-2 .6-1.2-.5-1.2-1.3-.4V10l1.3-.4.5-1.2-.6-1.2 2-2 .1.1 1 .6 1.2-.5.4-1.3h2.8l.4 1.3 1.2.5 1-.6.1-.1 2 2-.6 1.2.5 1.2 1.3.4v2.8l-1.3.4-.5 1.2Z"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8"/></svg>;
}

function IconButton({ label, icon, onClick, disabled = false }: { label: string; icon: string; onClick?: () => void; disabled?: boolean }) {
  return <button className="btn" type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon name={icon} size={18} /></button>;
}

function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local persistence is opportunistic on restricted WebViews.
  }
}

function getInitialMessages(): ChatMessage[] {
  const raw = safeRead(CHAT_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ChatMessage => Boolean(item && typeof item === 'object' && (item as ChatMessage).role && typeof (item as ChatMessage).content === 'string')).slice(-100);
  } catch {
    return [];
  }
}

function getConversationId(): string {
  const existing = safeRead(CONVERSATION_ID_KEY);
  if (existing) return existing;
  const generated = `andrew-${crypto.randomUUID()}`;
  safeWrite(CONVERSATION_ID_KEY, generated);
  return generated;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(getInitialMessages);
  const [conversationId] = useState(getConversationId);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('connected');
  const [statusText, setStatusText] = useState('Sistema listo');
  const [networkOnline, setNetworkOnline] = useState<boolean | null>(null);
  const [quakeCount, setQuakeCount] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [mediaName, setMediaName] = useState('');
  const [domain, setDomain] = useState<'earthquake' | 'social'>('earthquake');
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(() => createC33Brief('señales extrañas en el cielo'));
  const [projectId] = useState('iac33-main');
  const [lessonQuery, setLessonQuery] = useState('');
  const [learningVersion, setLearningVersion] = useState(0);
  const [userName, setUserName] = useState(() => safeRead(USER_NAME_KEY) || '');
  const historyRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const backendUrl = useMemo(() => (import.meta.env['VITE_ANDREW_BACKEND_URL'] || 'https://andrew2-api.onrender.com').trim().replace(/\/$/, ''), []);
  const result = useMemo(() => domain === 'earthquake' ? earthquakeRisk(demoSignals) : socialEventRisk(demoSignals), [domain]);
  const critical = useMemo(() => assessEvidence(demoEvidence), []);
  const stats = useMemo(() => learningStats(projectId), [projectId, learningVersion]);
  const lessons = useMemo(() => lessonQuery.trim() ? findRelevantLessons(lessonQuery, projectId) : [], [lessonQuery, projectId, learningVersion]);

  useEffect(() => {
    document.documentElement.dataset.theme = 'strict-dark';
    document.documentElement.style.colorScheme = 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#090D16');
  }, []);

  useEffect(() => {
    safeWrite(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-100)));
    requestAnimationFrame(() => {
      const el = historyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  function setNetwork(next: NetworkStatus, detail?: string) {
    setNetworkStatus(next);
    if (detail) setStatusText(detail);
    else if (next === 'connecting') setStatusText('Conectando…');
    else if (next === 'retrying') setStatusText('Reintentando conexión…');
    else if (next === 'connected') setStatusText('Conexión estable');
    else setStatusText('Conexión interrumpida');
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setDraft('');
    setBusy(true);
    setNetwork('connecting');
    try {
      const response: AndrewChatResponse = await sendAndrewMessage({ message: text, conversationId }, 65000, setNetwork);
      const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: response.reply || 'Sin contenido de respuesta.', createdAt: Date.now() };
      setMessages(prev => [...prev, assistantMessage]);
      setStatusText(`Respuesta recibida · ${response.model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible obtener respuesta del backend.';
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `Error de conexión: ${message}`, createdAt: Date.now() }]);
      setNetwork('error', message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshNetwork() {
    setStatusText('Consultando red pública…');
    setNetwork('connecting');
    const online = await checkAndrewBackend(setNetwork);
    setNetworkOnline(online);
    try {
      const data = await getRecentEarthquakes();
      setQuakeCount(data.features.length);
      setLastSync(Date.now());
      setStatusText(online ? 'Backend y datos públicos actualizados' : 'Datos públicos actualizados; backend no disponible');
    } catch {
      setStatusText(online ? 'Backend disponible; fuente sísmica no disponible' : 'No fue posible actualizar la red');
    }
  }

  async function handleMedia(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setStatusText('Selecciona un video válido.');
      return;
    }
    setMediaName(file.name);
    setMediaProgress(0);
    setStatusText('Preparando carga multimedia…');
    try {
      await uploadVideoInChunks(file, percent => setMediaProgress(percent), setNetwork);
      setMediaProgress(100);
      setStatusText('Video cargado correctamente en el backend');
    } catch (error) {
      setMediaProgress(null);
      setStatusText(error instanceof Error ? error.message : 'No fue posible cargar el video');
    }
  }

  function recordLearning() {
    try {
      learnFromOutcome({
        projectId,
        question: `${domain}: ${topic}`,
        observation: `Resultado con ${result.signals.length} señales y confianza ${result.confidence}.`,
        outcome: result.scenarios[0]?.label ?? 'Sin escenario principal',
        lesson: 'Las señales deben interpretarse como escenarios probabilísticos y contrastarse con nueva evidencia antes de elevar la confianza.',
        confidence: result.confidence === 'high' ? 0.8 : result.confidence === 'medium' ? 0.6 : 0.4,
      });
      setLearningVersion(v => v + 1);
      setStatusText('Aprendizaje registrado en memoria local');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'No fue posible registrar el aprendizaje');
    }
  }

  function saveUserName() {
    const normalized = userName.trim().slice(0, 80);
    setUserName(normalized);
    safeWrite(USER_NAME_KEY, normalized);
    setStatusText(normalized ? `Identidad local guardada: ${normalized}` : 'Nombre local eliminado');
  }

  function clearChat() {
    setMessages([]);
    safeWrite(CHAT_STORAGE_KEY, '[]');
    setStatusText('Historial local eliminado');
  }

  function renderChat() {
    return <section className="chat-screen" aria-label="Chat de Andrew">
      <header className="chat-header">
        <div className="chat-header-row">
          <div>
            <h2>{userName ? `Andrew · ${userName}` : 'Andrew 2.0'}</h2>
            <p>Asistente personal · memoria local · conexión segura</p>
          </div>
          <IconButton label="Limpiar historial" icon="settings" onClick={clearChat} disabled={busy || messages.length === 0} />
        </div>
      </header>
      <div className="chat-history" ref={historyRef} role="log" aria-live="polite" aria-label="Historial de conversación">
        {messages.length === 0 ? <div className="chat-empty"><div><strong>Andrew está listo.</strong><span>Escribe una consulta. El historial se guarda localmente en este dispositivo y las respuestas usan el backend configurado.</span></div></div> : messages.map(message => <div className={`message-row ${message.role}`} key={message.id}>
          <div className={`message-bubble ${message.role}`}>
            {message.content}
            <div className="message-meta">{message.role === 'user' ? 'Tú' : 'Andrew'} · {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>)}
        {busy && <div className="message-row assistant"><div className="message-bubble assistant">Andrew está procesando…</div></div>}
      </div>
      <form className="composer" onSubmit={sendMessage}>
        <div className="composer-row">
          <textarea
            ref={composerRef}
            className="textarea"
            value={draft}
            rows={1}
            placeholder="Escribe a Andrew…"
            onChange={event => setDraft(event.target.value.slice(0, 12000))}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={busy}
            enterKeyHint="send"
            aria-label="Mensaje para Andrew"
          />
          <button className="send-btn" type="submit" disabled={busy || !draft.trim()} aria-label="Enviar mensaje" title="Enviar mensaje"><Icon name="chat" size={20} /></button>
        </div>
        <div className="composer-status">{statusText}</div>
      </form>
    </section>;
  }

  function renderMedia() {
    return <div className="content-scroll"><div className="panel">
      <div className="section-heading"><div><h2>Multimedia</h2><p>Carga de video por fragmentos y estado de conexión.</p></div><span className="badge">Capacitor ready</span></div>
      <div className="grid">
        <article className="card">
          <h3>Carga de video</h3>
          <p>Los videos se envían por bloques para reducir fallos durante la transferencia móvil.</p>
          <div className="upload-drop">
            <input type="file" accept="video/*" onChange={event => handleMedia(event.target.files?.[0])} />
            {mediaName && <div className="file-name">{mediaName}</div>}
            {mediaProgress !== null && <div className="stat-box"><div className="value">{mediaProgress}%</div><div className="label">progreso de carga</div></div>}
          </div>
        </article>
        <article className="card">
          <h3>Estado multimedia</h3>
          <p>Backend: <strong>{networkStatus === 'error' ? 'ERROR' : networkStatus.toUpperCase()}</strong></p>
          <p>Endpoint: <strong>{backendUrl}</strong></p>
          <p>El módulo mantiene el tema oscuro y la navegación inferior visibles mientras el contenido multimedia se desplaza de forma independiente.</p>
        </article>
      </div>
    </div></div>;
  }

  function renderNetwork() {
    return <div className="content-scroll"><div className="panel">
      <div className="section-heading"><div><h2>Red</h2><p>Conectividad del backend y fuentes públicas autorizadas.</p></div><button className="btn btn-primary" type="button" onClick={refreshNetwork}>Actualizar</button></div>
      <div className="grid">
        <article className="card"><h3>Backend Andrew</h3><div className="kpi">{networkOnline === null ? '—' : networkOnline ? 'ONLINE' : 'OFFLINE'}</div><div className="kpi-label">{backendUrl}</div><div className="button-row"><span className="badge">{networkStatus.toUpperCase()}</span></div></article>
        <article className="card"><h3>Red pública</h3><p>Acceso web público: <strong>ACTIVO</strong></p><p>Datos satelitales públicos: <strong>ACTIVOS</strong></p><p>Redes privadas o control de infraestructura: <strong>BLOQUEADOS</strong></p></article>
        <article className="card"><h3>Última sincronización sísmica</h3><div className="kpi">{lastSync ? new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div><div className="kpi-label">Eventos recibidos: {quakeCount ?? '—'}</div></article>
      </div>
    </div></div>;
  }

  function renderSeismicity() {
    return <div className="content-scroll"><div className="panel">
      <div className="section-heading"><div><h2>Sismicidad</h2><p>Indicadores probabilísticos y datos públicos recientes.</p></div><span className="badge">No determinista</span></div>
      <div className="grid">
        <article className="card"><h3>Riesgo sísmico</h3><div className="kpi">{result.confidence.toUpperCase()}</div><p>{result.horizon}</p><ol className="list">{result.scenarios.map(s => <li key={s.label}>{s.label}: <strong>{Math.round(s.probability * 100)}%</strong></li>)}</ol><small>{result.warning}</small></article>
        <article className="card"><h3>Señales observadas</h3><div className="stat-grid">{result.signals.map(signal => <div className="stat-box" key={signal.name}><div className="value">{Math.round(signal.value * 100)}%</div><div className="label">{signal.name}</div></div>)}</div></article>
      </div>
    </div></div>;
  }

  function renderMetrics() {
    return <div className="content-scroll"><div className="panel">
      <div className="section-heading"><div><h2>Métricas</h2><p>Estado de memoria, pensamiento crítico y capacidades del sistema.</p></div><span className="badge">Local-first</span></div>
      <div className="grid">
        <article className="card"><h3>Memoria y aprendizaje</h3><div className="stat-grid"><div className="stat-box"><div className="value">{stats.records}</div><div className="label">registros</div></div><div className="stat-box"><div className="value">{stats.learningMemories}</div><div className="label">memorias</div></div><div className="stat-box"><div className="value">{Math.round(stats.averageConfidence * 100)}%</div><div className="label">confianza media</div></div></div><div className="button-row"><button className="btn btn-primary" type="button" onClick={recordLearning}>Registrar aprendizaje</button></div><div className="divider"/><input className="input" value={lessonQuery} onChange={event => setLessonQuery(event.target.value)} placeholder="Buscar aprendizajes…" />{lessons.length > 0 && <ul className="list">{lessons.map(lesson => <li key={lesson.id}>{lesson.lesson} <small>({Math.round(lesson.confidence * 100)}%)</small></li>)}</ul>}</article>
        <article className="card"><h3>Pensamiento crítico</h3><p>Confianza global: <strong>{critical.overallConfidence}</strong></p><p>Hechos: <strong>{critical.facts.length}</strong></p><p>Contradicciones: <strong>{critical.contradictions.length}</strong></p><p>Hipótesis: <strong>{critical.hypotheses.length}</strong></p></article>
        <article className="card"><h3>Capacidades</h3><ul className="list">{defaultCapabilities.map(capability => <li key={capability.id}>{capability.name}</li>)}</ul></article>
        <article className="card"><h3>Expediente C33</h3><input className="input" value={topic} onChange={event => setTopic(event.target.value)} /><div className="button-row"><button className="btn btn-primary" type="button" onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button></div><div className="divider"/><p><strong>{brief.title}</strong></p><p>Hook: {brief.hook}</p><p>Tesis: {brief.thesis}</p><p>Contrapuntos: {brief.counterpoints.join(' · ')}</p></article>
      </div>
    </div></div>;
  }

  function renderSettings() {
    return <div className="content-scroll"><div className="panel">
      <div className="section-heading"><div><h2>Configuración</h2><p>Controles locales y parámetros de conexión.</p></div><span className="badge">Strict Dark Mode</span></div>
      <div className="grid">
        <article className="card"><h3>Identidad local</h3><p>El nombre se guarda solo en el dispositivo para personalizar el encabezado del chat.</p><input className="input" value={userName} onChange={event => setUserName(event.target.value)} maxLength={80} placeholder="Tu nombre" /><div className="button-row"><button className="btn btn-primary" type="button" onClick={saveUserName}>Guardar</button><button className="btn" type="button" onClick={() => { setUserName(''); safeWrite(USER_NAME_KEY, ''); setStatusText('Nombre local eliminado'); }}>Borrar</button></div></article>
        <article className="card"><h3>Backend</h3><p>URL efectiva:</p><div className="file-name">{backendUrl}</div><div className="button-row"><button className="btn" type="button" onClick={refreshNetwork}>Probar conexión</button></div></article>
        <article className="card"><h3>Interfaz</h3><p>Modo: <strong>Strict Dark</strong></p><p>Área principal: <strong>100dvh</strong></p><p>Chat: <strong>scroll independiente</strong></p><p>Burbujas: <strong>85% máx.</strong></p><p>Bottom navigation: <strong>6 módulos + safe area</strong></p></article>
      </div>
    </div></div>;
  }

  function renderContent() {
    if (activeTab === 'chat') return renderChat();
    if (activeTab === 'media') return renderMedia();
    if (activeTab === 'network') return renderNetwork();
    if (activeTab === 'seismicity') return renderSeismicity();
    if (activeTab === 'metrics') return renderMetrics();
    return renderSettings();
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-row">
        <div className="brand-mark"><Icon name="chat" size={20} /></div>
        <div className="brand-copy"><h1 className="brand-title">Andrew 2.0</h1><p className="brand-subtitle">IAC33 · análisis · memoria · creación multimedia</p></div>
      </div>
      <div className="status-pill"><span className="status-dot" />{networkStatus === 'error' ? 'Offline' : 'Activo'}</div>
    </header>

    <main className="workspace">{renderContent()}</main>

    <nav className="bottom-nav" aria-label="Navegación principal">
      {tabs.map(tab => <button className={`nav-item ${activeTab === tab.id ? 'active' : ''}`} type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} aria-label={`${tab.label}, ${tab.subtitle}`}>
        <Icon name={tab.id === 'chat' ? 'chat' : tab.id} size={19} />
        <span>{tab.label}</span>
        <span className="nav-indicator" />
      </button>)}
    </nav>
  </div>;
}

export default App;
