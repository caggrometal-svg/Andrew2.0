import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaybackClock from "../src/editor/playback/playback-clock";
import { useTimelineStore } from "../src/editor/timeline/timeline-store";

describe("PlaybackClock", () => {
  let clock: PlaybackClock;
  let nextRafId = 1;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    nextRafId = 1;

    vi.useFakeTimers();
    vi.setSystemTime(0);

    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback): number => {
        const id = nextRafId++;
        rafCallbacks.push(callback);
        return id;
      },
    );

    vi.stubGlobal("cancelAnimationFrame", (_id: number): void => {});

    useTimelineStore.getState().clear();
    clock = new PlaybackClock();
  });

  afterEach(() => {
    clock.destroy();
    useTimelineStore.getState().clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const runNextFrame = (timestamp: number): void => {
    const callback = rafCallbacks.shift();
    if (!callback) throw new Error(`No rAF callback for ${timestamp}ms`);
    callback(timestamp);
  };

  it("start() activa el loop de reproducción", () => {
    useTimelineStore.getState().setDuration(10);
    clock.start();
    expect(useTimelineStore.getState().isPlaying).toBe(true);
    expect(useTimelineStore.getState().playing).toBe(true);
    expect(rafCallbacks).toHaveLength(1);
  });

  it("avanza proporcionalmente al delta real de performance.now()", () => {
    useTimelineStore.getState().setDuration(10);
    clock.start();
    runNextFrame(0);
    runNextFrame(1000);
    expect(useTimelineStore.getState().currentTime).toBeCloseTo(1, 5);
  });

  it("stop() detiene inmediatamente el flujo temporal", () => {
    useTimelineStore.getState().setDuration(10);
    clock.start();
    runNextFrame(0);
    runNextFrame(500);
    const stoppedAt = useTimelineStore.getState().currentTime;
    clock.stop();
    expect(useTimelineStore.getState().isPlaying).toBe(false);
    expect(useTimelineStore.getState().playing).toBe(false);
    expect(rafCallbacks).toHaveLength(0);
    runNextFrame(2500);
    expect(useTimelineStore.getState().currentTime).toBeCloseTo(stoppedAt, 5);
  });

  it("al llegar al final fija duration y pausa la reproducción", () => {
    useTimelineStore.getState().setDuration(2);
    clock.start();
    runNextFrame(0);
    runNextFrame(2000);
    expect(useTimelineStore.getState().currentTime).toBe(2);
    expect(useTimelineStore.getState().isPlaying).toBe(false);
    expect(useTimelineStore.getState().playing).toBe(false);
    expect(rafCallbacks).toHaveLength(0);
  });

  it("seek() durante la reproducción reajusta la base temporal", () => {
    useTimelineStore.getState().setDuration(20);
    clock.start();
    runNextFrame(0);
    runNextFrame(1000);
    expect(useTimelineStore.getState().currentTime).toBeCloseTo(1, 5);
    useTimelineStore.getState().seek(10);
    runNextFrame(1500);
    expect(useTimelineStore.getState().currentTime).toBeCloseTo(10.5, 5);
  });
});
