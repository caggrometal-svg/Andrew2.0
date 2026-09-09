import { useCallback, useRef } from "react";
import { useTimelineStore } from "../timeline/timeline-store";
import type { UUID } from "../types/andrew-core";

interface DragState { clipId: UUID; pointerId: number; offsetSeconds: number; trackId: UUID }
interface Options { pixelsPerSecond: number; snap?: number; onCommit?: () => void }

export function useTimelineDrag(options: Options): { onPointerDown: (event: React.PointerEvent<HTMLElement>, clipId: UUID) => void } {
  const drag=useRef<DragState | null>(null);
  const store=useTimelineStore();
  const onMove=useCallback((event: PointerEvent): void=>{ const current=drag.current; if(!current || event.pointerId!==current.pointerId) return; const dx=event.movementX/options.pixelsPerSecond; const clip=store.clips.find(c=>c.id===current.clipId); if(!clip) return; const proposed=clip.start+dx; const snap=options.snap ?? 0; const start=Math.max(0,snap>0 ? Math.round(proposed/snap)*snap : proposed); store.updateClip(current.clipId,{start,trackId:current.trackId}); },[options.pixelsPerSecond,options.snap,store]);
  const onUp=useCallback((event: PointerEvent): void=>{ const current=drag.current; if(!current || event.pointerId!==current.pointerId) return; window.removeEventListener("pointermove",onMove); window.removeEventListener("pointerup",onUp); window.removeEventListener("pointercancel",onUp); drag.current=null; options.onCommit?.(); },[onMove,options]);
  const onDown=useCallback((event: React.PointerEvent<HTMLElement>,clipId:UUID):void=>{ const clip=store.clips.find(c=>c.id===clipId); if(!clip || event.button!==0) return; store.selectClip(clipId); drag.current={clipId,pointerId:event.pointerId,offsetSeconds:0,trackId:clip.trackId}; event.currentTarget.setPointerCapture?.(event.pointerId); window.addEventListener("pointermove",onMove); window.addEventListener("pointerup",onUp); window.addEventListener("pointercancel",onUp); },[onMove,onUp,store]);
  return {onPointerDown:onDown};
}

export default useTimelineDrag;
