import { useEffect, useState } from 'react';
import { generateAndrewVideo, getAndrewVideoJob, type VideoGenerationJob } from '@network/videoGeneration';

interface Props {
  conversationId: string;
  referenceImageDataUrl?: string;
  contextText?: string;
  onStatus?: (message: string) => void;
}

const buttonStyle = { border: '1px solid #2b4057', background: '#162333', color: '#eaf3fb', borderRadius: 12, padding: '10px 14px', minHeight: 44, cursor: 'pointer', touchAction: 'manipulation' as const };

export default function VideoGenerationPanel({ conversationId, referenceImageDataUrl, contextText, onStatus }: Props) {
  const [prompt, setPrompt] = useState(contextText || 'Crea un video cinematográfico basado en esta conversación, con movimiento natural y una estética IAC33.');
  const [job, setJob] = useState<VideoGenerationJob | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!job || !['queued', 'in_progress'].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await getAndrewVideoJob(job.jobId);
        setJob(next);
        onStatus?.(`Generación de video · ${next.progress}%`);
        if (['completed', 'failed', 'cancelled'].includes(next.status)) window.clearInterval(timer);
      } catch (error) {
        onStatus?.(error instanceof Error ? error.message : 'No fue posible consultar el video.');
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status, onStatus]);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    onStatus?.('Iniciando generación de video con IA…');
    try {
      const created = await generateAndrewVideo({
        prompt: prompt.trim(),
        conversationId,
        model: 'sora-2',
        seconds: '8',
        size: '720x1280',
        referenceImageDataUrl,
      });
      setJob(created);
      onStatus?.('Video en cola de generación…');
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : 'No fue posible iniciar la generación.');
    } finally {
      setBusy(false);
    }
  }

  return <section style={{ marginTop: 14, padding: 14, borderRadius: 16, background: '#0b1119', border: '1px solid #26394d' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <div><strong>Generar video con IA</strong><div style={{ color: '#8e9dad', fontSize: 12, marginTop: 3 }}>Sora · tarea asíncrona · 8 s · vertical 720×1280</div></div>
      <button style={{ ...buttonStyle, background: busy ? '#15202b' : '#214c72' }} disabled={busy || !prompt.trim()} onClick={() => void generate()}>{busy ? 'Iniciando…' : 'Generar video'}</button>
    </div>
    <textarea value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} rows={3} placeholder="Describe el video que quieres crear…" style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, padding: 12, color: '#edf3f8', background: '#0a1018', border: '1px solid #26394d', borderRadius: 12, resize: 'vertical', font: 'inherit' }} />
    {job && <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9bc5eb' }}><span>{job.status}</span><span>{job.progress}%</span></div>
      <div style={{ height: 7, marginTop: 6, background: '#162333', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: `${Math.max(0, Math.min(100, job.progress))}%`, height: '100%', background: '#4e86b5', transition: 'width .4s ease' }} /></div>
      {job.status === 'completed' && job.videoUrl && <div style={{ marginTop: 12 }}><video src={`${(import.meta.env.VITE_ANDREW_BACKEND_URL || 'https://andrew2-api.onrender.com').replace(/\/$/, '')}${job.videoUrl}`} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 520, borderRadius: 12, background: '#05070a' }} /><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><a href={`${(import.meta.env.VITE_ANDREW_BACKEND_URL || 'https://andrew2-api.onrender.com').replace(/\/$/, '')}${job.videoUrl}`} download="andrew-video.mp4" style={{ ...buttonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Descargar</a><button style={buttonStyle} onClick={() => void generate()}>Reintentar</button></div></div>}
      {job.status === 'failed' && <div style={{ marginTop: 8, color: '#e7a4a4' }}>{job.error || 'La generación falló.'}</div>}
    </div>}
  </section>;
}
