import { beforeEach, describe, expect, it } from 'vitest';
import { MediaJobQueue } from './media-job-queue';

describe('MediaJobQueue', () => {
  beforeEach(() => localStorage.clear());

  it('creates queued jobs and persists state transitions', () => {
    const queue = new MediaJobQueue<{ prompt: string }>();
    const job = queue.enqueue('video', { prompt: 'test' });

    expect(job.status).toBe('queued');
    expect(queue.list()).toHaveLength(1);

    const updated = queue.update(job.id, { status: 'processing', progress: 42 });
    expect(updated?.status).toBe('processing');
    expect(updated?.progress).toBe(42);
    expect(queue.list()[0].progress).toBe(42);
  });
});
