import { afterEach, describe, expect, it, vi } from "vitest";
import { useTimelineStore } from "../timeline/timeline-store";
import type { Renderer } from "../types/andrew-core";
import { PlaybackPreviewSync } from "./playback-preview-sync";

class FakeRenderer implements Renderer {
  time = 0;
  playing = false;
  renders = 0;
  clips: readonly unknown[] = [];
  tracks: readonly unknown[] = [];
  assets: Record<string, unknown> = {};

  resize(): void {}
  setTime(time: number): void { this.time = time; }
  setClips(clips: readonly never[]): void { this.clips = clips; }
  setTracks(tracks: readonly never[]): void { this.tracks = tracks; }
  setAssets(assets: Record<string, never>): void { this.assets = assets; }
  setPlaying(playing: boolean): void { this.playing = playing; }
  render(): void { this.renders += 1; }
  deleteAssetTexture(): void {}
  dispose(): void {}
}

describe("PlaybackPreviewSync", () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  afterEach(() => {
    callbacks.clear();
    vi.restoreAllMocks();
    useTimelineStore.getState().clear();
  });

  it("pushes initial timeline state without writing to Zustand", () => {
    const renderer = new FakeRenderer();
    const sync = new PlaybackPreviewSync(renderer);
    expect(renderer.time).toBe(0);
    expect(renderer.playing).toBe(false);
    sync.destroy();
  });

  it("coalesces multiple timeline updates into one animation frame", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));

    const renderer = new FakeRenderer();
    const sync = new PlaybackPreviewSync(renderer);
    useTimelineStore.getState().seek(0.25);
    useTimelineStore.getState().seek(0.5);
    useTimelineStore.getState().seek(0.75);

    expect(renderer.time).toBe(0.75);
    expect(renderer.renders).toBe(0);
    const pending = [...callbacks.values()];
    expect(pending).toHaveLength(1);
    pending[0](16);
    expect(renderer.renders).toBe(1);
    sync.destroy();
  });

  it("mirrors play/pause state while leaving the store mutation to its own actions", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));

    const renderer = new FakeRenderer();
    const sync = new PlaybackPreviewSync(renderer);
    useTimelineStore.getState().play();
    expect(renderer.playing).toBe(true);
    useTimelineStore.getState().pause();
    expect(renderer.playing).toBe(false);
    sync.destroy();
  });
});
