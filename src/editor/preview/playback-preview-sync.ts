import { useTimelineStore } from "../timeline/timeline-store";
import type { Renderer } from "../types/andrew-core";

export interface PreviewRendererController extends Renderer {
  setAssets?(assets: ReturnType<typeof useTimelineStore.getState>["assetsMap"]): void;
  setTracks?(tracks: ReturnType<typeof useTimelineStore.getState>["tracks"]): void;
  setPlaying?(playing: boolean): void;
}

/**
 * Coalesces Zustand timeline updates into one render per browser frame.
 * PlaybackClock remains the single source of time; this class never writes to the store.
 */
export class PlaybackPreviewSync {
  private raf: number | null = null;
  private destroyed = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly renderer: PreviewRendererController) {
    const initial = useTimelineStore.getState();
    this.pushState(initial);

    this.unsubscribe = useTimelineStore.subscribe((state, previous) => {
      if (this.destroyed) return;
      const timelineChanged = state.currentTime !== previous.currentTime;
      const structureChanged = state.clips !== previous.clips || state.tracks !== previous.tracks;
      const assetsChanged = state.assetsMap !== previous.assetsMap;
      const playbackChanged = state.isPlaying !== previous.isPlaying;

      if (!timelineChanged && !structureChanged && !assetsChanged && !playbackChanged) return;
      this.pushState(state);
      this.scheduleRender();
    });
  }

  renderNow(): void {
    if (this.destroyed) return;
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.renderer.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private pushState(state: ReturnType<typeof useTimelineStore.getState>): void {
    this.renderer.setTime(state.currentTime);
    this.renderer.setClips(state.clips);
    this.renderer.setTracks?.(state.tracks);
    this.renderer.setAssets?.(state.assetsMap);
    this.renderer.setPlaying?.(state.isPlaying);
  }

  private scheduleRender(): void {
    if (this.raf !== null) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      if (!this.destroyed) this.renderer.render();
    });
  }
}

export default PlaybackPreviewSync;
