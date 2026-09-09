import type { AssetsMap, ManagedAsset, SerializableTimelineState, TimelineClip, TimelineState, TimelineStoreContract, TimelineStoreActions, TimelineTrack, UUID } from "../types/andrew-core";

type Listener = () => void;

const makeId = (): UUID => crypto.randomUUID();
const initialTrack = (): TimelineTrack => ({ id: makeId(), name: "Video 1", order: 0, muted: false, locked: false, visible: true });

const initialState: TimelineState = { tracks: [initialTrack()], clips: [], currentTime: 0, duration: 0, fps: 30, playing: false, loop: false, zoom: 1 };
let state: TimelineStoreContract = { ...initialState, assetsMap: {} } as TimelineStoreContract;
const listeners = new Set<Listener>();

const emit = (): void => { for (const listener of listeners) listener(); };
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const recalcDuration = (): number => state.clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
const mutate = (patch: Partial<TimelineStoreContract>): void => { state = { ...state, ...patch }; emit(); };

const actions: TimelineStoreActions = {
  addTrack(track = {}): UUID { const id = track.id ?? makeId(); const next = { id, name: track.name ?? `Pista ${state.tracks.length + 1}`, order: track.order ?? state.tracks.length, muted: track.muted ?? false, locked: track.locked ?? false, visible: track.visible ?? true }; mutate({ tracks: [...state.tracks, next] }); return id; },
  removeTrack(id): void { if (state.tracks.length <= 1) return; const fallback = state.tracks.find(t => t.id !== id); mutate({ tracks: state.tracks.filter(t => t.id !== id), clips: state.clips.map(c => c.trackId === id && fallback ? { ...c, trackId: fallback.id } : c) }); },
  updateTrack(id, patch): void { mutate({ tracks: state.tracks.map(t => t.id === id ? { ...t, ...patch } : t) }); },
  reorderTrack(id, order): void { const sorted = [...state.tracks].sort((a, b) => a.order - b.order); const target = sorted.find(t => t.id === id); if (!target) return; target.order = Math.max(0, Math.floor(order)); sorted.sort((a, b) => a.order - b.order).forEach((t, i) => { t.order = i; }); mutate({ tracks: sorted }); },
  addClip(clip): UUID { const id = clip.id ?? makeId(); const next = { ...clip, id, start: Math.max(0, clip.start), duration: Math.max(0.001, clip.duration), speed: Math.max(0.01, clip.speed), volume: clamp(clip.volume, 0, 1) }; mutate({ clips: [...state.clips, next], duration: Math.max(state.duration, next.start + next.duration), selectedClipId: id }); return id; },
  removeClip(id): void { mutate({ clips: state.clips.filter(c => c.id !== id), selectedClipId: state.selectedClipId === id ? undefined : state.selectedClipId, duration: recalcDuration() }); },
  updateClip(id, patch): void { const clips = state.clips.map(c => c.id === id ? { ...c, ...patch, start: Math.max(0, patch.start ?? c.start), duration: Math.max(0.001, patch.duration ?? c.duration), speed: Math.max(0.01, patch.speed ?? c.speed), volume: clamp(patch.volume ?? c.volume, 0, 1) } : c); mutate({ clips, duration: recalcDuration() }); },
  moveClip(id, start, trackId): void { const clip = state.clips.find(c => c.id === id); if (!clip) return; actions.updateClip(id, { start: Math.max(0, start), ...(trackId ? { trackId } : {}) }); },
  seek(time): void { actions.setCurrentTime(time); },
  setCurrentTime(time): void { mutate({ currentTime: clamp(time, 0, state.duration) }); },
  setDuration(duration): void { const next = Math.max(0, duration); mutate({ duration: next, currentTime: clamp(state.currentTime, 0, next) }); },
  setFPS(fps): void { mutate({ fps: clamp(Math.round(fps), 1, 240) }); },
  togglePlay(): void { mutate({ playing: !state.playing }); },
  setPlaying(playing): void { mutate({ playing }); },
  setLoop(loop): void { mutate({ loop }); },
  setZoom(zoom): void { mutate({ zoom: clamp(zoom, 0.1, 20) }); },
  selectClip(id): void { mutate({ selectedClipId: id }); },
  selectTrack(id): void { mutate({ selectedTrackId: id }); },
  clear(): void { mutate({ ...initialState, tracks: [initialTrack()], assetsMap: state.assetsMap }); },
  load(next): void { mutate({ ...next, clips: next.clips.map(c => ({ ...c })) }); }
};

Object.assign(state, actions, {
  setAsset(asset: ManagedAsset): void { state = { ...state, assetsMap: { ...state.assetsMap, [asset.id]: asset } }; emit(); },
  removeAsset(id: UUID): void { const next = { ...state.assetsMap }; delete next[id]; state = { ...state, assetsMap: next, clips: state.clips.filter(c => c.assetId !== id) }; emit(); },
  getSerializableTimelineState(): SerializableTimelineState { return { tracks: state.tracks.map(t => ({ ...t })), clips: state.clips.map(c => ({ ...c, transform: { ...c.transform }, appearance: { ...c.appearance }, effects: { filters: { ...c.effects.filters } } })), selectedClipId: state.selectedClipId, selectedTrackId: state.selectedTrackId, currentTime: state.currentTime, duration: state.duration, fps: state.fps, playing: false, loop: state.loop, zoom: state.zoom }; }
});

export const useTimelineStore = Object.assign(
  (() => state) as (() => TimelineStoreContract) & { subscribe(listener: Listener): () => void; getState(): TimelineStoreContract },
  { subscribe(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }, getState(): TimelineStoreContract { return state; } },
  state
);

export default useTimelineStore;
