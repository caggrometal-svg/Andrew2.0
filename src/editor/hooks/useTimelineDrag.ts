import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useTimelineStore } from "../timeline/timeline-store";
import type { UUID } from "../types/andrew-core";
interface DragState { clipId: UUID; pointerId: number; startX: number; startY: number; startTime: number; trackId: UUID; startTrackIndex: number }
interface Options { pixelsPerSecond: number; trackHeight?: number; snap?: number; onCommit?: () => void }
export function useTimelineDrag(options: Options): { onPointerDown: (event: ReactPointerEvent<HTMLElement>, clipId: UUID) => void } {
  const drag = useRef<DragState | null>(null);
  const onMove = useCallback((event: PointerEvent): void => {
    const d = drag.current; if (!d || event.pointerId !== d.pointerId) return; const store = useTimelineStore.getState(); const clip = store.clips.find((c) => c.id === d.clipId); if (!clip) return;
    const snap = options.snap ?? 0; const raw = Math.max(0, d.startTime + (event.clientX - d.startX) / Math.max(0.001, options.pixelsPerSecond)); const startTime = snap > 0 ? Math.round(raw / snap) * snap : raw;
    const tracks = [...store.tracks].sort((a, b) => a.order - b.order); const trackDelta = Math.round((event.clientY - d.startY) / Math.max(1, options.trackHeight ?? 52)); const target = tracks[d.startTrackIndex + trackDelta]; store.moveClip(d.clipId, startTime, target?.id ?? d.trackId);
  }, [options.pixelsPerSecond, options.snap, options.trackHeight]);
  const onUp = useCallback((event: PointerEvent): void => { const d = drag.current; if (!d || event.pointerId !== d.pointerId) return; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); drag.current = null; options.onCommit?.(); }, [onMove, options.onCommit]);
  const onDown = useCallback((event: ReactPointerEvent<HTMLElement>, clipId: UUID): void => { if (event.button !== 0) return; const store = useTimelineStore.getState(); const clip = store.clips.find((c) => c.id === clipId); if (!clip) return; const tracks = [...store.tracks].sort((a, b) => a.order - b.order); const startTrackIndex = tracks.findIndex((track) => track.id === clip.trackId); if (startTrackIndex < 0 || tracks[startTrackIndex].locked) return; store.selectClip(clipId); drag.current = { clipId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTime: clip.startTime, trackId: clip.trackId, startTrackIndex }; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp); event.currentTarget.setPointerCapture?.(event.pointerId); }, [onMove, onUp]);
  return { onPointerDown: onDown };
}
export default useTimelineDrag;
