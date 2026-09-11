export type TrackKind = 'video' | 'audio' | 'overlay';

export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  start: number;
  duration: number;
  sourceStart: number;
  sourceDuration: number;
  title?: string;
}

export interface TimelineTrack {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  clips: TimelineClip[];
}

export interface TimelineState {
  version: 1;
  duration: number;
  playhead: number;
  selectedClipId: string | null;
  tracks: TimelineTrack[];
  updatedAt: number;
}

const STORAGE_KEY = 'andrew:editor:timeline:v1';

function storage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

const emptyState = (): TimelineState => ({
  version: 1,
  duration: 0,
  playhead: 0,
  selectedClipId: null,
  tracks: [
    { id: 'video-1', kind: 'video', name: 'Video 1', muted: false, locked: false, clips: [] },
    { id: 'audio-1', kind: 'audio', name: 'Audio 1', muted: false, locked: false, clips: [] },
    { id: 'overlay-1', kind: 'overlay', name: 'Overlay 1', muted: false, locked: false, clips: [] },
  ],
  updatedAt: Date.now(),
});

function load(): TimelineState {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const value = JSON.parse(raw) as TimelineState;
    if (value?.version !== 1 || !Array.isArray(value.tracks)) return emptyState();
    return value;
  } catch { return emptyState(); }
}

function save(state: TimelineState): TimelineState {
  const next = { ...state, updatedAt: Date.now() };
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* best effort */ }
  return next;
}

function clipId(): string { return `clip-${crypto.randomUUID()}`; }

export class TimelineStore {
  private state = load();

  snapshot(): TimelineState { return structuredClone(this.state); }

  reset(): TimelineState {
    this.state = save(emptyState());
    return this.snapshot();
  }

  private commit(next: TimelineState): TimelineState {
    this.state = save(next);
    return this.snapshot();
  }

  addClip(input: Omit<TimelineClip, 'id'>): TimelineState {
    if (input.duration <= 0 || input.sourceDuration <= 0 || input.start < 0 || input.sourceStart < 0) throw new Error('Invalid timeline clip bounds');
    const track = this.state.tracks.find((item) => item.id === input.trackId);
    if (!track || track.locked) throw new Error('Track unavailable');
    const clip = { ...input, id: clipId() };
    track.clips = [...track.clips, clip].sort((a, b) => a.start - b.start);
    return this.commit({ ...this.state, selectedClipId: clip.id, duration: Math.max(this.state.duration, clip.start + clip.duration) });
  }

  moveClip(id: string, start: number): TimelineState {
    if (start < 0) throw new Error('Invalid clip start');
    const track = this.state.tracks.find((item) => item.clips.some((clip) => clip.id === id));
    if (!track || track.locked) throw new Error('Track unavailable');
    const clip = track.clips.find((item) => item.id === id)!;
    clip.start = start;
    track.clips.sort((a, b) => a.start - b.start);
    return this.commit({ ...this.state, duration: Math.max(0, ...this.state.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration))) });
  }

  trimClip(id: string, sourceStart: number, duration: number): TimelineState {
    if (sourceStart < 0 || duration <= 0) throw new Error('Invalid trim bounds');
    for (const track of this.state.tracks) {
      const clip = track.clips.find((item) => item.id === id);
      if (!clip) continue;
      if (track.locked || sourceStart + duration > clip.sourceStart + clip.sourceDuration) throw new Error('Trim exceeds source bounds');
      clip.sourceStart = sourceStart;
      clip.sourceDuration = duration;
      clip.duration = duration;
      return this.commit({ ...this.state, duration: Math.max(0, ...this.state.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration))) });
    }
    return this.snapshot();
  }

  splitClip(id: string, at: number): TimelineState {
    if (at <= 0) throw new Error('Invalid split position');
    for (const track of this.state.tracks) {
      const index = track.clips.findIndex((item) => item.id === id);
      if (index < 0) continue;
      if (track.locked) throw new Error('Track unavailable');
      const original = track.clips[index];
      if (at >= original.duration) throw new Error('Split outside clip');
      const first: TimelineClip = { ...original, id: clipId(), duration: at, sourceDuration: at };
      const second: TimelineClip = { ...original, id: clipId(), start: original.start + at, sourceStart: original.sourceStart + at, duration: original.duration - at, sourceDuration: original.sourceDuration - at };
      track.clips.splice(index, 1, first, second);
      return this.commit({ ...this.state, selectedClipId: second.id });
    }
    return this.snapshot();
  }

  removeClip(id: string): TimelineState {
    for (const track of this.state.tracks) {
      if (track.locked) continue;
      track.clips = track.clips.filter((clip) => clip.id !== id);
    }
    return this.commit({ ...this.state, selectedClipId: null, duration: Math.max(0, ...this.state.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration))) });
  }

  setPlayhead(time: number): TimelineState {
    return this.commit({ ...this.state, playhead: Math.max(0, Math.min(time, this.state.duration)) });
  }
}
