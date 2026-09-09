import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaybackClock from "../src/editor/playback/playback-clock";
import { useTimelineStore } from "../src/editor/timeline/timeline-store";

describe("PlaybackClock", () => {
  let clock: PlaybackClock;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance", "requestAnimationFrame", "cancelAnimationFrame"] });
    vi.setSystemTime(0);
    useTimelineStore.getState().clear();
    clock = new PlaybackClock();
  });

  afterEach(() => {
    clock.destroy();
    useTimelineStore.getState().clear();
    vi.useRealTimers();
  });

  it("start() activa el loop de reproducción", () => {
    useTimelineStore.getState().setDuration(10);

    clock.start();

    expect(useTimelineStore.getState().isPlaying).toBe(true);
    expect(useTimelineStore.getState().playing).toBe(true);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it("avanza proporcionalmente al delta real de performance.now()", () => {
    useTimelineStore.getState().setDuration(10);
    clock.start();

    vi.advanceTimersByTime(1000);

    expect(useTimelineStore.getState().currentTime).toBeCloseTo(1, 3);
  });

  it("stop() detiene inmediatamente el flujo temporal", () => {
    useTimelineStore.getState().setDuration(10);
    clock.start();
    vi.advanceTimersByTime(500);

    const stoppedAt = useTimelineStore.getState().currentTime;
    clock.stop();
    expect(useTimelineStore.getState().isPlaying).toBe(false);
    expect(useTimelineStore.getState().playing).toBe(false);

    vi.advanceTimersByTime(2000);

    expect(useTimelineStore.getState().currentTime).toBeCloseTo(stoppedAt, 3);
  });

  it("al llegar al final fija duration y pausa la reproducción", () => {
    useTimelineStore.getState().setDuration(2);
    clock.start();

    vi.advanceTimersByTime(2000);

    expect(useTimelineStore.getState().currentTime).toBe(2);
    expect(useTimelineStore.getState().isPlaying).toBe(false);
    expect(useTimelineStore.getState().playing).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("seek() durante la reproducción reajusta la base temporal", () => {
    useTimelineStore.getState().setDuration(20);
    clock.start();
    vi.advanceTimersByTime(1000);

    useTimelineStore.getState().seek(10);
    vi.advanceTimersByTime(500);

    expect(useTimelineStore.getState().currentTime).toBeCloseTo(10.5, 3);
  });
});
