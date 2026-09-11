import { useMemo, useState } from 'react';
import './styles.css';
import { TimelineStore, type TimelineState } from './editor/timeline-store';
import { sendThroughBridge } from './network/andrewBridge';

type Message = { role: 'user' | 'assistant'; text: string };

function formatSeconds(value: number): string { return `${value.toFixed(1)}s`; }

export default function App() {
  const store = useMemo(() => new TimelineStore(), []);
  const [mode, setMode] = useState<'chat' | 'editor'>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [timeline, setTimeline] = useState<TimelineState>(() => store.snapshot());
  const [error, setError] = useState('');

  function apply(action: () => TimelineState): void {
    try { setTimeline(action()); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo modificar la línea de tiempo.'); }
  }

  async function sendBridgeMessage(value: string): Promise<void> {
    setMessages((current) => [...current, { role: 'user', text: value }]);
    setBusy(true);
    setError('');
    try {
      const response = await sendThroughBridge(value);
      setMessages((current) => [...current, { role: 'assistant', text: response.reply }]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Error de conexión con Andrew.';
      setError(message);
      setMessages((current) => [...current, { role: 'assistant', text: `No pude procesar la solicitud: ${message}` }]);
    } finally { setBusy(false); }
  }

  async function sendMessage(): Promise<void> {
    const value = input.trim();
    if (!value || busy) return;
    setInput('');
    await sendBridgeMessage(value);
  }

  async function analyzeTimeline(): Promise<void> {
    if (busy) return;
    const compact = timeline.tracks.map((track) => `${track.name}: ${track.clips.map((clip) => `${clip.title || clip.assetId} ${formatSeconds(clip.start)}-${formatSeconds(clip.start + clip.duration)}`).join(', ') || 'sin clips'}`).join(' | ');
    await sendBridgeMessage(`Analiza mi timeline local. Duración total ${formatSeconds(timeline.duration)}. ${compact}. Indica cortes, huecos o solapamientos que debería revisar.`);
    setMode('chat');
  }

  function addClip(): void {
    apply(() => store.addClip({ assetId: `asset-${Date.now()}`, trackId: 'video-1', start: timeline.duration, duration: 5, sourceStart: 0, sourceDuration: 5, title: `Clip ${timeline.tracks[0].clips.length + 1}` }));
  }

  const selected = timeline.selectedClipId;
  const selectedClip = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === selected);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><span className="eyebrow">IAC33 · NEURAL RUNTIME</span><h1>Andrew 2.0</h1><p>Asistente · memoria · bridge · edición local</p></div>
        <span className="status-pill">{busy ? 'Procesando' : 'Listo'}</span>
      </header>
      <nav className="mode-bar" aria-label="Secciones">
        <button className={`mode-button ${mode === 'chat' ? 'active' : ''}`} type="button" onClick={() => setMode('chat')}>Andrew Chat</button>
        <button className={`mode-button ${mode === 'editor' ? 'active' : ''}`} type="button" onClick={() => setMode('editor')}>Editor / Timeline</button>
      </nav>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {mode === 'chat' ? (
        <section className="chat-panel">
          <div className="messages" role="log" aria-live="polite">
            {messages.length === 0 && <div className="empty-state">Bridge listo · memoria persistente en backend</div>}
            {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`message ${message.role}`}><span className="message-label">{message.role === 'user' ? 'Tú' : 'Andrew 2.0'}</span><div className="message-body">{message.text}</div></article>)}
          </div>
          <form className="composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <input className="composer-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" />
            <button className="send-button" type="submit" disabled={!input.trim() || busy}>{busy ? '…' : 'Enviar'}</button>
          </form>
        </section>
      ) : (
        <section className="editor-panel" aria-label="Editor local">
          <div className="editor-toolbar">
            <button type="button" onClick={addClip}>+ Clip</button>
            <button type="button" disabled={!selectedClip} onClick={() => selectedClip && apply(() => store.splitClip(selectedClip.id, Math.max(0.1, selectedClip.duration / 2)))}>Cortar</button>
            <button type="button" disabled={!selectedClip} onClick={() => selectedClip && apply(() => store.trimClip(selectedClip.id, selectedClip.sourceStart, Math.max(0.5, selectedClip.duration - 0.5)))}>Recortar</button>
            <button type="button" disabled={!selectedClip} onClick={() => selectedClip && apply(() => store.removeClip(selectedClip.id))}>Eliminar</button>
            <button type="button" disabled={!timeline.tracks.some((track) => track.clips.length) || busy} onClick={() => void analyzeTimeline()}>Analizar con Andrew</button>
            <span className="timeline-meta">Duración {formatSeconds(timeline.duration)} · Playhead {formatSeconds(timeline.playhead)}</span>
          </div>
          <div className="preview-stage"><span>Vista previa local</span><strong>{selectedClip?.title || 'Selecciona un clip'}</strong></div>
          <div className="timeline" role="region" aria-label="Línea de tiempo">
            {timeline.tracks.map((track) => <div className="track" key={track.id}>
              <div className="track-label"><strong>{track.name}</strong><small>{track.kind}</small></div>
              <div className="track-lane">
                {track.clips.map((clip) => <button type="button" className={`timeline-clip ${clip.id === selected ? 'selected' : ''}`} key={clip.id} style={{ left: `${clip.start * 10}px`, width: `${Math.max(54, clip.duration * 10)}px` }} onClick={() => setTimeline({ ...timeline, selectedClipId: clip.id })}>
                  <strong>{clip.title || clip.assetId}</strong><small>{formatSeconds(clip.duration)}</small>
                </button>)}
              </div>
            </div>)}
          </div>
          <input className="playhead" type="range" min="0" max={Math.max(0.1, timeline.duration)} step="0.1" value={Math.min(timeline.playhead, Math.max(0.1, timeline.duration))} onChange={(event) => apply(() => store.setPlayhead(Number(event.target.value)))} aria-label="Playhead" />
          <p className="editor-note">Timeline persistente local. “Analizar con Andrew” envía el estado resumido al bridge.</p>
        </section>
      )}
    </main>
  );
}
