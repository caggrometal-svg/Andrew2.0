import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { TimelineStore, type TimelineState } from './editor/timeline-store';
import { sendThroughBridge } from './network/andrewBridge';
import { startBridgeCommandLoop } from './network/bridgeCommandLoop';
import { fetchChileSeismicity, seismicProjection, type SeismicEvent } from './services/seismic';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from './settings/app-settings';

type Message = { role: 'user' | 'assistant'; text: string };
type View = 'chat' | 'editor' | 'seismic' | 'settings' | 'c33';
const formatSeconds = (v: number) => `${v.toFixed(1)}s`;

export default function App() {
  const store = useMemo(() => new TimelineStore(), []);
  const [view, setView] = useState<View>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [timeline, setTimeline] = useState<TimelineState>(() => store.snapshot());
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [seismic, setSeismic] = useState<SeismicEvent[]>([]);
  const [seismicBusy, setSeismicBusy] = useState(false);
  const [seismicError, setSeismicError] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => startBridgeCommandLoop((e) => { if (e.message !== 'Bridge HTTP 429') setError(`Bridge remoto: ${e.message}`); }), []);

  useEffect(() => {
    if (settings.autoScroll) messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: settings.reducedMotion ? 'auto' : 'smooth' });
  }, [messages, settings.autoScroll, settings.reducedMotion]);

  async function refreshSeismic() {
    setSeismicBusy(true); setSeismicError('');
    try { setSeismic(await fetchChileSeismicity()); }
    catch (e) { setSeismicError(e instanceof Error ? e.message : 'No se pudo consultar al CSN.'); }
    finally { setSeismicBusy(false); }
  }

  useEffect(() => { if (view === 'seismic' && settings.seismicAutoRefresh && !seismic.length) void refreshSeismic(); }, [view, settings.seismicAutoRefresh]);

  function apply(action: () => TimelineState) {
    try { setTimeline(action()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo modificar la línea de tiempo.'); }
  }

  async function sendBridgeMessage(value: string) {
    setMessages((m) => [...m, { role: 'user', text: value }]); setBusy(true); setError('');
    try { const response = await sendThroughBridge(value); setMessages((m) => [...m, { role: 'assistant', text: response.reply }]); }
    catch (e) { const msg = e instanceof Error ? e.message : 'Error de conexión con Andrew.'; setError(msg); setMessages((m) => [...m, { role: 'assistant', text: `No pude procesar la solicitud: ${msg}` }]); }
    finally { setBusy(false); }
  }

  async function sendMessage() { const value = input.trim(); if (!value || busy) return; setInput(''); await sendBridgeMessage(value); }

  async function analyzeTimeline() {
    if (busy) return;
    const compact = timeline.tracks.map((t) => `${t.name}: ${t.clips.map((c) => `${c.title || c.assetId} ${formatSeconds(c.start)}-${formatSeconds(c.start + c.duration)}`).join(', ') || 'sin clips'}`).join(' | ');
    await sendBridgeMessage(`Analiza mi timeline local. Duración total ${formatSeconds(timeline.duration)}. ${compact}. Indica cortes, huecos o solapamientos que debería revisar.`);
    setView('chat');
  }

  function addClip() {
    const videoTrack = timeline.tracks.find((track) => track.id === 'video-1');
    if (!videoTrack) { setError('No existe la pista de video principal.'); return; }
    apply(() => store.addClip({ assetId: `asset-${Date.now()}`, trackId: videoTrack.id, start: timeline.duration, duration: 5, sourceStart: 0, sourceDuration: 5, title: `Clip ${videoTrack.clips.length + 1}` }));
  }

  async function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    if (key === 'notifications' && value === true && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* WebView may not expose permission APIs */ }
    }
    const next = saveSettings({ ...settings, [key]: value }); setSettings(next);
  }

  const selectedClip = timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === timeline.selectedClipId);
  const projection = seismicProjection(seismic);

  return <main className="app-shell">
    <header className="app-header"><div><span className="eyebrow">IAC33 · NEURAL RUNTIME</span><h1>Andrew 2.0</h1><p>Asistente · memoria · análisis · edición local</p></div><span className="status-pill">{busy || seismicBusy ? 'Procesando' : 'Listo'}</span></header>
    <button className="c33-card" type="button" onClick={() => setView('c33')}><span className="c33-mark">C33</span><span><strong>Expediente C33</strong><small>Hecho · Evidencia · Anomalía · Teoría · Veredicto</small></span><span>›</span></button>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="content-panel">
      {view === 'chat' && <><div className="section-head"><div><span className="eyebrow">ASISTENTE</span><h2>Andrew Chat</h2></div><span className="section-badge">{busy ? 'procesando' : 'bridge activo'}</span></div><div className="messages" ref={messagesRef} role="log" aria-live="polite">{!messages.length && <div className="empty-state"><strong>Andrew listo</strong><span>Memoria persistente · bridge · respuestas en este panel</span></div>}{messages.map((m, i) => <article key={`${m.role}-${i}`} className={`message ${m.role}`}><span className="message-label">{m.role === 'user' ? 'Tú' : 'Andrew 2.0'}</span><div className="message-body">{m.text}</div></article>)}{busy && <div className="typing"><i /><i /><i /> Andrew está procesando…</div>}</div><form className="composer" onSubmit={(e) => { e.preventDefault(); void sendMessage(); }}><input className="composer-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Mensaje para Andrew…" aria-label="Mensaje" /><button className="send-button" type="submit" disabled={!input.trim() || busy}>Enviar</button></form></>}
      {view === 'editor' && <section className="editor-panel"><div className="section-head"><div><span className="eyebrow">MULTIMEDIA</span><h2>Editor / Timeline</h2></div></div><div className="editor-toolbar"><button type="button" onClick={addClip}>+ Clip</button><button type="button" disabled={!selectedClip} onClick={() => selectedClip && apply(() => store.splitClip(selectedClip.id, Math.max(.1, selectedClip.duration / 2)))}>Cortar</button><button type="button" disabled={!selectedClip} onClick={() => selectedClip && apply(() => store.trimClip(selectedClip.id, selectedClip.sourceStart, Math.max(.5, selectedClip.duration - .5)))}>Recortar</button><button type="button" disabled={!selectedClip} onClick={() => selectedClip && apply(() => store.removeClip(selectedClip.id))}>Eliminar</button><button type="button" disabled={!timeline.tracks.some((t) => t.clips.length) || busy} onClick={() => void analyzeTimeline()}>Analizar con Andrew</button></div><div className="preview-stage"><span>Vista previa local</span><strong>{selectedClip?.title || 'Selecciona un clip'}</strong></div><div className="timeline">{timeline.tracks.map((track) => <div className="track" key={track.id}><div className="track-label"><strong>{track.name}</strong><small>{track.kind}</small></div><div className="track-lane">{track.clips.map((clip) => <button type="button" className={`timeline-clip ${clip.id === timeline.selectedClipId ? 'selected' : ''}`} key={clip.id} style={{ left: `${clip.start * 10}px`, width: `${Math.max(54, clip.duration * 10)}px` }} onClick={() => setTimeline({ ...timeline, selectedClipId: clip.id })}><strong>{clip.title || clip.assetId}</strong><small>{formatSeconds(clip.duration)}</small></button>)}</div></div>)}</div><input className="playhead" type="range" min="0" max={Math.max(.1, timeline.duration)} step=".1" value={Math.min(timeline.playhead, Math.max(.1, timeline.duration))} onChange={(e) => apply(() => store.setPlayhead(Number(e.target.value)))} /></section>}
      {view === 'seismic' && <section className="seismic-panel"><div className="section-head"><div><span className="eyebrow">CHILE · CSN</span><h2>Red sísmica</h2></div><button className="compact-button" type="button" onClick={() => void refreshSeismic()} disabled={seismicBusy}>Actualizar</button></div><div className="source-note">Centro Sismológico Nacional de la Universidad de Chile · solo eventos filtrados para Chile.</div>{seismicError && <div className="error-banner">{seismicError}</div>}<div className="seismic-stats"><div><b>{projection.count}</b><span>eventos</span></div><div><b>{projection.maxMagnitude || '—'}</b><span>máxima M</span></div><div><b>{projection.avgDepth || '—'} km</b><span>prof. media</span></div></div><div className="seismic-list">{seismic.map((e) => <article key={e.id}><div><strong>M {e.magnitude.toFixed(1)}</strong><span>{e.place}</span></div><div><span>{e.localDate}</span><span>{e.depthKm} km</span></div></article>)}{!seismic.length && <div className="empty-state"><span>{seismicBusy ? 'Consultando CSN…' : 'Sin datos cargados.'}</span></div>}</div><p className="analysis-note">{projection.note}</p></section>}
      {view === 'settings' && <section className="settings-panel"><div className="section-head"><div><span className="eyebrow">SISTEMA</span><h2>Configuración</h2></div></div>{([['notifications','Notificaciones','Solicitar permiso y habilitar avisos del sistema'],['autoScroll','Auto-scroll del chat','Mantener la respuesta más reciente visible'],['seismicAutoRefresh','Actualización sísmica','Consultar CSN al abrir Red sísmica'],['reducedMotion','Movimiento reducido','Evitar animaciones innecesarias']] as const).map(([key,title,desc]) => <label className="setting-row" key={key}><span><strong>{title}</strong><small>{desc}</small></span><input type="checkbox" checked={settings[key]} onChange={(e) => void updateSetting(key, e.target.checked)} /></label>)}<button className="reset-button" type="button" onClick={() => setSettings(saveSettings(DEFAULT_SETTINGS))}>Restaurar valores</button></section>}
      {view === 'c33' && <section className="c33-panel"><div className="section-head"><div><span className="eyebrow">EXPEDIENTE</span><h2>C33</h2></div></div><div className="c33-formula"><b>HECHO</b><b>EVIDENCIA</b><b>ANOMALÍA</b><b>TEORÍA(S)</b><b>VEREDICTO / PREGUNTA ABIERTA</b></div><p>Casos reales que todavía generan preguntas. Las teorías se presentan como hipótesis, no como hechos.</p><button type="button" className="primary-button" onClick={() => { setView('chat'); setInput('Analiza un caso para Expediente C33 siguiendo la fórmula Hecho → Evidencia → Anomalía → Teoría(s) → Veredicto.'); }}>Abrir análisis con Andrew</button></section>}
    </section>
    <nav className="bottom-nav" aria-label="Navegación principal"><button className={view === 'chat' ? 'active' : ''} type="button" onClick={() => setView('chat')}><span>⌂</span><small>Andrew</small></button><button className={view === 'editor' ? 'active' : ''} type="button" onClick={() => setView('editor')}><span>▣</span><small>Editor</small></button><button className={view === 'seismic' ? 'active' : ''} type="button" onClick={() => setView('seismic')}><span>⌁</span><small>Sismos</small></button><button className={view === 'settings' ? 'active' : ''} type="button" onClick={() => setView('settings')}><span>⚙</span><small>Ajustes</small></button></nav>
  </main>;
}
