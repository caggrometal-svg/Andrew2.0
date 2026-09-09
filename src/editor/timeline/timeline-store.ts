import { create } from "zustand";
import type { AssetsMap, ManagedAsset, SerializableTimelineState, TimelineClip, TimelineClipPatch, TimelineState, TimelineStoreActions, TimelineTrack, UUID } from "../types/andrew-core";

const id = (): UUID => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const initial = (): TimelineState => ({ tracks: [{ id: id(), name: "Video 1", order: 0, muted: false, locked: false, visible: true }], clips: [], currentTime: 0, duration: 0, fps: 30, playing: false, loop: false, zoom: 1 });
const endOf = (clips: readonly TimelineClip[]): number => clips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0);
const normalize = (clip: TimelineClip): TimelineClip => ({ ...clip, startTime: Math.max(0, clip.startTime), duration: Math.max(0.001, clip.duration), transform: { ...clip.transform, scaleX: Math.max(0, clip.transform.scaleX), scaleY: Math.max(0, clip.transform.scaleY) }, adjustments: { opacity: clamp(clip.adjustments.opacity, 0, 1), brightness: Math.max(0, clip.adjustments.brightness), contrast: Math.max(0, clip.adjustments.contrast), saturation: Math.max(0, clip.adjustments.saturation) } });

export interface TimelineStore extends TimelineState, TimelineStoreActions { assetsMap: AssetsMap }

export const useTimelineStore = create<TimelineStore>()((set, get) => ({
  ...initial(), assetsMap: {},
  addTrack: (p = {}) => { const tracks = get().tracks; const newId = p.id ?? id(); set({ tracks: [...tracks, { id: newId, name: p.name ?? `Pista ${tracks.length + 1}`, order: p.order ?? tracks.length, muted: p.muted ?? false, locked: p.locked ?? false, visible: p.visible ?? true }] }); return newId; },
  removeTrack: (trackId) => { const s = get(); if (s.tracks.length <= 1) return; const fallback = s.tracks.find((t) => t.id !== trackId); if (!fallback) return; set({ tracks: s.tracks.filter((t) => t.id !== trackId).map((t, i) => ({ ...t, order: i })), clips: s.clips.map((c) => c.trackId === trackId ? { ...c, trackId: fallback.id } : c), selectedTrackId: s.selectedTrackId === trackId ? fallback.id : s.selectedTrackId }); },
  updateTrack: (trackId, patch) => set((s) => ({ tracks: s.tracks.map((t) => t.id === trackId ? { ...t, ...patch } : t) })),
  reorderTrack: (trackId, order) => set((s) => ({ tracks: s.tracks.map((t) => t.id === trackId ? { ...t, order: Math.max(0, Math.floor(order)) } : t).sort((a, b) => a.order - b.order).map((t, i) => ({ ...t, order: i })) })),
  addClip: (clip) => { const newId = clip.id ?? id(); const next = normalize({ ...clip, id: newId } as TimelineClip); const s = get(); set({ clips: [...s.clips, next], duration: Math.max(s.duration, endOf([...s.clips, next])), selectedClipId: newId }); return newId; },
  removeClip: (clipId) => set((s) => ({ clips: s.clips.filter((c) => c.id !== clipId), selectedClipId: s.selectedClipId === clipId ? undefined : s.selectedClipId })),
  updateClip: (clipId, patch: TimelineClipPatch) => { const s = get(); let found = false; const clips = s.clips.map((c) => { if (c.id !== clipId) return c; found = true; return normalize({ ...c, ...patch } as TimelineClip); }); if (!found) return; const duration = Math.max(s.duration, endOf(clips)); set({ clips, duration, currentTime: clamp(s.currentTime, 0, duration) }); },
  moveClip: (clipId, startTime, trackId) => get().updateClip(clipId, { startTime: Math.max(0, startTime), ...(trackId ? { trackId } : {}) } as TimelineClipPatch),
  seek: (time) => get().setCurrentTime(time),
  setCurrentTime: (time) => set((s) => ({ currentTime: clamp(time, 0, s.duration) })),
  setDuration: (duration) => set((s) => { const d = Math.max(Math.max(0, duration), endOf(s.clips)); return { duration: d, currentTime: clamp(s.currentTime, 0, d) }; }),
  setFPS: (fps) => set({ fps: clamp(Math.round(fps), 1, 240) }), togglePlay: () => set((s) => ({ playing: !s.playing })), setPlaying: (playing) => set({ playing }), setLoop: (loop) => set({ loop }), setZoom: (zoom) => set({ zoom: clamp(zoom, 0.1, 20) }),
  selectClip: (selectedClipId) => set({ selectedClipId }), selectTrack: (selectedTrackId) => set({ selectedTrackId }),
  clear: () => set({ ...initial(), assetsMap: {} }), load: (state) => set({ ...state, playing: false }),
  setAsset: (asset: ManagedAsset) => set((s) => ({ assetsMap: { ...s.assetsMap, [asset.id]: asset } })),
  removeAsset: (assetId) => set((s) => { const assetsMap = { ...s.assetsMap }; delete assetsMap[assetId]; const clips = s.clips.filter((c) => c.type !== "media" || c.assetId !== assetId); return { assetsMap, clips, selectedClipId: s.selectedClipId && clips.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : undefined }; }),
  getSerializableTimelineState: () => { const s = get(); return JSON.parse(JSON.stringify({ tracks: s.tracks, clips: s.clips, selectedClipId: s.selectedClipId, selectedTrackId: s.selectedTrackId, currentTime: s.currentTime, duration: s.duration, fps: s.fps, playing: false, loop: s.loop, zoom: s.zoom })) as SerializableTimelineState; },
}));

export default useTimelineStore;
