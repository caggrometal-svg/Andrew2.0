export type MediaJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface MediaJob<TPayload = unknown> {
  id: string;
  kind: 'video' | 'image';
  status: MediaJobStatus;
  payload: TPayload;
  progress: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'andrew:media-job-queue:v1';

function readJobs(): MediaJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs: MediaJob[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(-50)));
  } catch {
    // Persistence is best-effort; active work remains owned by the caller.
  }
}

export class MediaJobQueue<TPayload = unknown> {
  enqueue(kind: MediaJob['kind'], payload: TPayload): MediaJob<TPayload> {
    const now = Date.now();
    const job: MediaJob<TPayload> = { id: `media-${crypto.randomUUID()}`, kind, status: 'queued', payload, progress: 0, createdAt: now, updatedAt: now };
    writeJobs([...readJobs(), job]);
    return job;
  }

  update(id: string, patch: Partial<Pick<MediaJob, 'status' | 'progress' | 'error'>>): MediaJob<TPayload> | null {
    const jobs = readJobs();
    const index = jobs.findIndex(job => job.id === id);
    if (index < 0) return null;
    const current = jobs[index];
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: Date.now() } as MediaJob<TPayload>;
    jobs[index] = next;
    writeJobs(jobs);
    return next;
  }

  list(): MediaJob<TPayload>[] {
    return readJobs() as MediaJob<TPayload>[];
  }
}
