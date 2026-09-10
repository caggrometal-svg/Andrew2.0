import { useMemo, useRef, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { earthquakeRisk, socialEventRisk, type Signal } from '@analysis/probabilistic';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getRecentEarthquakes } from '@network/publicWeb';
import { sendAndrewMessage, uploadVideoInChunks, type AndrewAttachment } from '@network/andrewBackend';
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

type ChatMessage = { role: 'user' | 'assistant'; text: string; attachment?: AndrewAttachment };
type UiStatus = 'ready' | 'thinking' | 'generating' | 'memory' | 'error';

const styles = {
  page: { minHeight: '100vh', background: 'radial-gradient(circle at 20% 0%, #162338 0, #090d13 42%, #06080c 100%)', color: '#edf3f8', fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: 'max(16px, env(safe-area-inset-top)) 16px calc(40px + env(safe-area-inset-bottom))', boxSizing: 'border-box' },
  shell: { maxWidth: 1180, margin: '0 auto' },
  card: { background: 'rgba(14,20,29,.82)', border: '1px solid rgba(126,155,185,.18)', borderRadius: 20, boxShadow: '0 18px 50px rgba(0,0,0,.28)', backdropFilter: 'blur(18px)' },
  muted: { color: '#8e9dad' },
  button: { border: '1px solid #2b4057', background: '#162333', color: '#eaf3fb', borderRadius: 12, padding: '10px 14px', cursor: 'pointer', touchAction: 'manipulation', minHeight: 44 },
} as const;

export default function App() {
  const [domain, setDomain] = useState<'earthquake' | 'social'>('earthquake');
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(createC33Brief(topic));
  const [quakeCount, setQuakeCount] = useState<number | null>(null);
  const [status, setStatus] = useState('Listo · sistema preparado');
  const [uiStatus, setUiStatus] = useState<UiStatus>('ready');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [attachment, setAttachment] = useState<AndrewAttachment | undefined>();
  const [attachmentFile, setAttachmentFile] = useState<File | undefined>();
  const [attachmentPreview, setAttachmentPreview] = useState<string | undefined>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [conversationId] = useState(() => crypto.randomUUID());
  const result = useMemo(() => domain === 'earthquake' ? earthquakeRisk(demoSignals) : socialEventRisk(demoSignals), [domain]);
  const critical = useMemo(() => assessEvidence(demoEvidence), []);

  async function updateNetwork() {
    setStatus('Sincronizando datos públicos…');
    setUiStatus('memory');
    try {
      const data = await getRecentEarthquakes();
      setQuakeCount(data.features.length);
      setStatus('Red pública actualizada');
      setUiStatus('ready');
    } catch {
      setStatus('No fue posible consultar la fuente');
      setUiStatus('error');
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setStatus('Formato no compatible');
      setUiStatus('error');
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      setStatus('Archivo demasiado grande · máximo 250 MB');
      setUiStatus('error');
      return;
    }

    const type = file.type.startsWith('image/') ? 'image' : 'video';
    if (type === 'image') {
      if (file.size > 5 * 1024 * 1024) {
        setStatus('Imagen demasiado grande · máximo 5 MB');
        setUiStatus('error');
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No fue posible leer la imagen'));
        reader.readAsDataURL(file);
      });
      setAttachment({ type, name: file.name, mimeType: file.type, dataUrl, size: file.size });
      setAttachmentFile(undefined);
      setAttachmentPreview(dataUrl);
      setStatus('Imagen preparada para análisis contextual');
    } else {
      setAttachment({ type, name: file.name, mimeType: file.type, size: file.size });
      setAttachmentFile(file);
      setAttachmentPreview(undefined);
      setUploadProgress(0);
      setStatus('Video seleccionado · se cargará por fragmentos al enviar');
    }
    setUiStatus('ready');
  }

  function clearAttachment() {
    setAttachment(undefined);
    setAttachmentFile(undefined);
    setAttachmentPreview(undefined);
    setUploadProgress(null);
  }

  async function sendChat() {
    const message = chatInput.trim();
    if ((!message && !attachment) || chatBusy) return;
    setChatBusy(true);
    setUiStatus('thinking');
    setStatus('Pensando…');

    try {
      let currentAttachment = attachment;
      if (attachment?.type === 'video' && attachmentFile) {
        setStatus('Preparando video · carga por fragmentos');
        setUploadProgress(0);
        currentAttachment = await uploadVideoInChunks(attachmentFile, progress => {
          setUploadProgress(progress);
          setStatus(`Sincronizando video · ${progress}%`);
        });
      }

      const currentMessage = message || 'Analiza el archivo adjunto.';
      setChatInput('');
      setChatMessages(current => [...current, { role: 'user', text: currentMessage, attachment: currentAttachment }]);
      const memory = chatMessages.slice(-10).map(item => `${item.role}: ${item.text}`);
      clearAttachment();
      setStatus('Pensando…');
      const response = await sendAndrewMessage({ message: currentMessage, conversationId, memory, attachment: currentAttachment });
      setUiStatus('generating');
      setStatus(`Generando IA · ${response.model}`);
      setChatMessages(current => [...current, { role: 'assistant', text: response.reply }]);
      window.setTimeout(() => {
        setUiStatus('memory');
        setStatus('Sincronizando Memoria IAC33…');
        window.setTimeout(() => {
          setUiStatus('ready');
          setStatus('Listo · memoria IAC33 sincronizada');
        }, 450);
      }, 250);
    } catch (error) {
      setChatMessages(current => [...current, { role: 'assistant', text: error instanceof Error ? `No pude completar la solicitud: ${error.message}` : 'No pude conectar con Andrew.' }]);
      setStatus('Sin conexión o carga multimedia incompleta · puedes reintentar');
      setUiStatus('error');
    } finally {
      setChatBusy(false);
    }
  }

  const statusLabel = uiStatus === 'thinking' ? 'Pensando…' : uiStatus === 'generating' ? 'Generando IA…' : uiStatus === 'memory' ? 'Sincronizando Memoria IAC33…' : uiStatus === 'error' ? 'Conexión interrumpida' : 'Andrew listo';

  return <main style={styles.page}>
    <div style={styles.shell}>
      <header style={{ ...styles.card, padding: 24, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#6f9ac2' }}>IAC33 · Neural Runtime</div><h1 style={{ margin: '7px 0 4px', fontSize: 32 }}>Andrew 2.0</h1><p style={{ ...styles.muted, margin: 0 }}>Asistente personal · análisis · memoria · creación multimedia</p></div>
          <div aria-live="polite" style={{ padding: '10px 14px', borderRadius: 14, background: uiStatus === 'error' ? '#321c22' : '#11251f', border: '1px solid rgba(113,180,155,.2)', fontSize: 13 }}>{statusLabel}</div>
        </div>
      </header>

      <section style={{ ...styles.card, padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>Chat IA</h2><p style={{ ...styles.muted, margin: '5px 0 0' }}>Sesión persistente · backend seguro · entrada multimedia</p></div><span style={{ fontSize: 12, ...styles.muted }}>ID {conversationId.slice(0, 8)}</span></div>
        <div style={{ minHeight: 260, maxHeight: 430, overflowY: 'auto', padding: 8, display: 'grid', gap: 10, WebkitOverflowScrolling: 'touch' }}>
          {chatMessages.length === 0 ? <div style={{ display: 'grid', placeItems: 'center', minHeight: 240, ...styles.muted, textAlign: 'center' }}>Escribe a Andrew o adjunta una imagen/video para comenzar.</div> : chatMessages.map((item, index) => <div key={index} style={{ justifySelf: item.role === 'user' ? 'end' : 'start', width: 'fit-content', maxWidth: '88%', padding: '12px 14px', borderRadius: item.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: item.role === 'user' ? '#18324a' : '#121a24', border: '1px solid rgba(126,155,185,.16)', lineHeight: 1.5, overflowWrap: 'anywhere' }}><div style={{ fontSize: 11, ...styles.muted, marginBottom: 4 }}>{item.role === 'user' ? 'Tú' : 'Andrew 2.0'}</div>{item.attachment && <div style={{ marginBottom: 8, fontSize: 12, color: '#9bc5eb' }}>Adjunto: {item.attachment.name} · {item.attachment.type}{item.attachment.size ? ` · ${Math.round(item.attachment.size / 1024 / 1024 * 10) / 10} MB` : ''}</div>}{item.text}</div>)}
        </div>

        {attachment && <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0', padding: 10, borderRadius: 12, background: '#0b1119', border: '1px solid #26394d' }}>{attachmentPreview ? <img src={attachmentPreview} alt="Vista previa" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 9 }} /> : <div style={{ width: 54, height: 54, display: 'grid', placeItems: 'center', background: '#172333', borderRadius: 9, fontSize: 12 }}>VIDEO</div>}<div style={{ flex: 1, minWidth: 0 }}><b style={{ overflowWrap: 'anywhere' }}>{attachment.name}</b><div style={{ ...styles.muted, fontSize: 12 }}>{attachment.mimeType}{uploadProgress !== null && attachment.type === 'video' ? ` · ${uploadProgress}%` : ''}</div></div><button style={styles.button} onClick={clearAttachment} disabled={chatBusy}>Quitar</button></div>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}><button style={{ ...styles.button, minWidth: 48, fontSize: 20 }} onClick={() => fileInputRef.current?.click()} disabled={chatBusy} title="Adjuntar imagen o video" aria-label="Adjuntar imagen o video">+</button><input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={event => void handleFile(event)} hidden /><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendChat(); }} placeholder="Escribe una instrucción para Andrew…" disabled={chatBusy} style={{ flex: 1, minWidth: 0, padding: '12px 14px', color: '#edf3f8', background: '#0a1018', border: '1px solid #26394d', borderRadius: 12, outline: 'none', fontSize: 16 }} /><button onClick={() => void sendChat()} disabled={chatBusy || (!chatInput.trim() && !attachment)} style={{ ...styles.button, background: chatBusy ? '#15202b' : '#214c72', minWidth: 92 }}>{chatBusy ? 'Procesando' : 'Enviar'}</button></div>
        <div style={{ marginTop: 10, fontSize: 12, ...styles.muted }}>{status} · La clave de OpenAI permanece en el backend.</div>
      </section>

      <VideoGenerationPanel
        conversationId={conversationId}
        referenceImageDataUrl={attachment?.type === 'image' ? attachment.dataUrl : undefined}
        contextText={chatMessages.length ? `Crea un video basado en esta conversación de Andrew 2.0: ${chatMessages.slice(-4).map(item => `${item.role}: ${item.text}`).join(' ')}` : undefined}
        onStatus={setStatus}
      />

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}><article style={{ ...styles.card, padding: 18 }}><h2>Red mundial pública</h2><p style={styles.muted}>Acceso web público: <b>ACTIVO</b></p><p style={styles.muted}>Datos sísmicos públicos: <b>ACTIVOS</b></p><button style={styles.button} onClick={() => void updateNetwork()}>Actualizar datos sísmicos</button>{quakeCount !== null && <p>Eventos recibidos: {quakeCount}</p>}</article><article style={{ ...styles.card, padding: 18 }}><h2>Pronóstico</h2><button style={styles.button} onClick={() => setDomain('earthquake')}>Riesgo sísmico</button>{' '}<button style={styles.button} onClick={() => setDomain('social')}>Eventos sociales</button><p>Horizonte: {result.horizon} · Confianza: {result.confidence}</p><ol>{result.scenarios.map(s => <li key={s.label}>{s.label}: <strong>{Math.round(s.probability * 100)}%</strong></li>)}</ol><small style={styles.muted}>{result.warning}</small></article><article style={{ ...styles.card, padding: 18 }}><h2>Autonomía</h2><p style={styles.muted}>Nivel: <b>ASSISTED</b></p><ul>{defaultCapabilities.map(c => <li key={c.id}>{c.name}</li>)}</ul></article><article style={{ ...styles.card, padding: 18 }}><h2>Pensamiento crítico</h2><p>Confianza global: <strong>{critical.overallConfidence}</strong></p><p style={styles.muted}>Hechos: {critical.facts.length} · Contradicciones: {critical.contradictions.length} · Hipótesis: {critical.hypotheses.length}</p></article></section>

      <section style={{ ...styles.card, padding: 20, marginTop: 16 }}><h2>Expediente C33</h2><input value={topic} onChange={e => setTopic(e.target.value)} style={{ width: '100%', padding: 12, boxSizing: 'border-box', color: '#edf3f8', background: '#0a1018', border: '1px solid #26394d', borderRadius: 12, fontSize: 16 }} /><button style={{ ...styles.button, marginTop: 9 }} onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button><h3>{brief.title}</h3><p><b>Hook:</b> {brief.hook}</p><p><b>Tesis:</b> {brief.thesis}</p><p><b>Contrapuntos:</b> {brief.counterpoints.join(' · ')}</p><p><b>Guion:</b> {brief.script}</p></section>
    </div>
  </main>;
}
