import { useEffect, useMemo, useState } from 'react';
import { MediaJobQueue, type MediaJob } from '@core/jobs/media-job-queue';
import { generateAndrewVideo, getAndrewVideoJob, type VideoGenerationJob } from '@network/videoGeneration';

interface Props {
  conversationId: string;
  referenceImageDataUrl?: string;
  contextText?: string;
  onStatus?: (message: string) => void;
}

const buttonStyle = { border: '1px solid #2b4057', background: '#162333', color: '#eaf3fb', borderRadius: 12, padding: '10px 14px', minHeight: 44, cursor: 'pointer', touchAction: 'manipulation' as const };
type VideoPayload = { prompt: string; conversationId: string };

export default function VideoGenerationPanel({ conversationId, referenceImageDataUrl, contextText, onStatus }: Props) {
  const [prompt, setPrompt] = useState(contextText || 'Crea un video cinematográfico basado en esta conversación, con movimiento natural y una estética IAC33.');
  const [job, setJob] = useState<VideoGenerationJob | null>(null);
  const [localJob, setLocalJob] = useState<MediaJob<VideoPayload> | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useMemo(() => new MediaJobQueue<VideoPayload>(), []);

  useEffect(() => {
    if (!job || !['queued', 'in_progress'].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await getAndrewVideoJob(job.jobId);
        setJob(next);
        if (localJob) queue.update(localJob.id, { status: next.status === 'completed' ? 'completed' : next.status === 'failed' ? 'failed' : 'processing', progress: next.progress, ...(next.error ? { error: next.error } : {}) });
        onStatus?.(`Generación de video · ${next.progress}%`);
        if (['completed', 'failed', 'cancelled'].includes(next.status)) window.clearInterval(timer);
      } catch (error) {
        if (localJob) queue.update(localJob.id, { status: 'failed', error: error instanceof Error ? error.message : 'No fue posible consultar el video.' });
        onStatus?.(error instanceof Error ? error.message : 'No fue posible consultar el video.');
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status, localJob, onStatus, queue]);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    const queued = queue.enqueue('video', { prompt: prompt.trim(), conversationId });
    setLocalJob(queued);
    onStatus?.('Video en cola local…');
    queue.update(queued.id, { status: 'processing', progress: 0 });
    try {
      const created = await generateAndrewVideo({
        prompt: prompt.trim(),
        conversationId,
        model: 'sora-2',
        seconds: '8',
        size: '720x1280',
        ...(referenceImageDataUrl ? { referenceImageDataUrl } : {}),
      });
      setJob(created);
      queue.update(queued.id, { status: 'processing', progress: created.progress });
      onStatus?.('Video aceptado por el proveedor; seguimiento asíncrono activo.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible iniciar la generación.';
      queue.update(queued.id, { status: 'failed', error: message });
      onStatus?.(message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="media-panel">
    <div className="media-panel-header">
      <div><strong>Generación multimedia</strong><div className="muted media-subtitle">Cola local → proveedor asíncrono → seguimiento persistente</div></div>
      <button style={{ ...buttonStyle, background: busy ? '#15202b' : '#214c72' }} disabled={busy || !prompt.trim()} onClick={() => void generate()}>{busy ? 'Encolando…' : 'Generar video'}</button>
    </div>
    <textarea className="media-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} rows={3} placeholder="Describe el video que quieres crear…" />
    {localJob && <div className="metric-list media-job-list">
      <div><span>Trabajo local</span><strong>{localJob.status}</strong></div>
      <div><span>Progreso</span><strong>{localJob.progress}%</strong></div>
      {localJob.error && <div><span>Error</span><strong>{localJob.error}</strong></div>}
    </div>}
    {job && <div className="media-result">
      <div className="media-progress"><span>{job.status}</span><strong>{job.progress}%</strong></div>
      <div className="media-progress-bar"><div style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div>
      {job.status === 'completed' && job.videoUrl && <video src={`${(import.meta.env['VITE_ANDREW_BACKEND_URL'] || 'https://andrew2-api.onrender.com').replace(/\/$/, '')}${job.videoUrl}`} controls playsInline preload="metadata" />}
      {job.status === 'failed' && <div className="notice">{job.error || 'La generación falló.'}</div>}
    </div>}
  </section>;
}
