export type VideoGenerationStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface VideoGenerationJob {
  ok: true;
  jobId: string;
  status: VideoGenerationStatus | string;
  progress: number;
  model?: string;
  prompt?: string;
  error?: string | null;
  videoUrl?: string | null;
}

function backendUrl(): string {
  return (import.meta.env['VITE_ANDREW_BACKEND_URL'] || 'https://andrew2-api.onrender.com').replace(/\/$/, '');
}

export async function generateAndrewVideo(input: {
  prompt: string;
  conversationId: string;
  model?: 'sora-2' | 'sora-2-pro';
  seconds?: '4' | '8' | '12';
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024';
  referenceImageDataUrl?: string;
}): Promise<VideoGenerationJob> {
  const response = await fetch(`${backendUrl()}/api/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json() as VideoGenerationJob | { ok: false; message?: string; error?: string };
  if (!response.ok || !data.ok) throw new Error(data.ok ? 'No fue posible iniciar la generación.' : (data.message || data.error || 'VIDEO_GENERATION_FAILED'));
  return data;
}

export async function getAndrewVideoJob(jobId: string): Promise<VideoGenerationJob> {
  const response = await fetch(`${backendUrl()}/api/generate-video/${encodeURIComponent(jobId)}`, {
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json() as VideoGenerationJob | { ok: false; message?: string; error?: string };
  if (!response.ok || !data.ok) throw new Error(data.ok ? 'No fue posible consultar el video.' : (data.message || data.error || 'VIDEO_JOB_NOT_FOUND'));
  return data;
}
