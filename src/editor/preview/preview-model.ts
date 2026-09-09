import type { TimelineClip, TimelineTrack } from "../types/andrew-core";

export type PreviewClip = TimelineClip & {
  trackOrder: number;
};

export function getActivePreviewClips(
  clips: readonly TimelineClip[],
  tracks: readonly TimelineTrack[],
  time: number,
): PreviewClip[] {
  const t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const trackOrder = new Map(tracks.map((track) => [track.id, track]));

  return clips
    .filter((clip) => {
      const track = trackOrder.get(clip.trackId);
      if (!track || !track.visible) return false;
      return t >= clip.startTime && t < clip.startTime + clip.duration;
    })
    .map((clip) => ({ ...clip, trackOrder: trackOrder.get(clip.trackId)!.order }))
    .sort((a, b) => a.zIndex - b.zIndex || a.trackOrder - b.trackOrder);
}

export function getMediaTime(clip: Extract<TimelineClip, { type: "media" }>, time: number): number {
  const local = Math.max(0, time - clip.startTime);
  return Math.max(0, clip.trimStart + local);
}
