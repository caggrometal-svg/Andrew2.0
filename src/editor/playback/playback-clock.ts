import { useTimelineStore } from "../timeline/timeline-store";

export class PlaybackClock {
  private frameId: number | null = null;
  private previousTimestamp: number | null = null;
  private baseTime = 0;
  private running = false;
  private destroyed = false;
  private updatingTime = false;
  private readonly unsubscribe: () => void;

  constructor() {
    this.unsubscribe = useTimelineStore.subscribe((state, previousState) => {
      if (this.destroyed) return;

      if (state.currentTime !== previousState.currentTime && !this.updatingTime) {
        this.baseTime = state.currentTime;
        this.previousTimestamp = performance.now();
      }

      if (!state.isPlaying && previousState.isPlaying && this.running) {
        this.cancelFrame();
      }
    });
  }

  start(): void {
    if (this.destroyed || this.running) return;

    const state = useTimelineStore.getState();
    this.baseTime = state.currentTime;
    this.previousTimestamp = performance.now();

    if (state.duration <= state.currentTime) {
      this.setCurrentTime(state.duration);
      state.pause();
      return;
    }

    this.running = true;
    state.play();
    this.frameId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.destroyed) return;
    this.cancelFrame();
    const state = useTimelineStore.getState();
    if (state.isPlaying) state.pause();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.cancelFrame();
    this.unsubscribe();
    this.destroyed = true;
  }

  private readonly tick = (timestamp: number): void => {
    if (this.destroyed || !this.running) return;

    const previousTimestamp = this.previousTimestamp;
    if (previousTimestamp === null) {
      this.previousTimestamp = timestamp;
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }

    const delta = Math.max(0, (timestamp - previousTimestamp) / 1000);
    this.previousTimestamp = timestamp;
    this.baseTime += delta;

    const state = useTimelineStore.getState();
    const duration = Math.max(0, state.duration);
    const nextTime = Math.max(0, this.baseTime);

    if (nextTime >= duration) {
      const overflow = nextTime - duration;
      // Future loop mode can use `overflow` to continue from the beginning.
      void overflow;
      this.setCurrentTime(duration);
      state.pause();
      this.cancelFrame();
      return;
    }

    this.setCurrentTime(nextTime);
    this.frameId = requestAnimationFrame(this.tick);
  };

  private setCurrentTime(time: number): void {
    this.updatingTime = true;
    try {
      useTimelineStore.getState().seek(time);
    } finally {
      this.updatingTime = false;
    }
  }

  private cancelFrame(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this.running = false;
    this.previousTimestamp = null;
  }
}

export default PlaybackClock;
