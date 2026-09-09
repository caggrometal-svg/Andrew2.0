import { describe, expect, it, beforeEach } from "vitest";
import { bindMediaAssetToTimeline, createMediaClip, toMediaAsset } from "./media-timeline-binding";
import { useTimelineStore } from "./timeline-store";
import type { ManagedAsset } from "../types/andrew-core";

const videoAsset = (overrides: Partial<ManagedAsset> = {}): ManagedAsset => ({
  id: "asset-video-1",
  name: "clip.mp4",
  type: "video",
  mimeType: "video/mp4",
  size: 100,
  duration: 12,
  source: new Blob(["video"], { type: "video/mp4" }),
  ...overrides,
});

describe("media-timeline-binding", () => {
  beforeEach(() => useTimelineStore.getState().clear());

  it("converts a File-shaped input into a platform-neutral MediaAsset", () => {
    const file = { name: "photo.jpg", type: "image/jpeg", size: 4 } as File;
    expect(toMediaAsset(file)).toMatchObject({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      kind: "image",
      size: 4,
      source: file,
    });
  });

  it("creates a production-safe media clip from a managed asset", () => {
    const clip = createMediaClip(videoAsset(), "track-1", 4, 2);
    expect(clip).toMatchObject({
      type: "media",
      assetId: "asset-video-1",
      trackId: "track-1",
      startTime: 4,
      duration: 12,
      trimStart: 0,
      trimEnd: 0,
      zIndex: 2,
    });
    expect(clip.transform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 });
    expect(clip.adjustments).toEqual({ opacity: 1, brightness: 1, contrast: 1, saturation: 1 });
  });

  it("registers the asset and creates a timeline clip without changing playback state", () => {
    const store = useTimelineStore.getState();
    store.setCurrentTime(2);
    store.setPlaying(true);

    const clipId = bindMediaAssetToTimeline(videoAsset());
    const after = useTimelineStore.getState();

    expect(clipId).toBeTruthy();
    expect(after.assetsMap["asset-video-1"]).toBeDefined();
    expect(after.clips).toHaveLength(1);
    expect(after.clips[0]).toMatchObject({ assetId: "asset-video-1", startTime: 0, duration: 12 });
    expect(after.playing).toBe(true);
    expect(after.isPlaying).toBe(true);
    expect(after.currentTime).toBe(2);
  });

  it("does not create timeline clips for audio-only assets", () => {
    const audio = videoAsset({ id: "asset-audio-1", type: "audio", mimeType: "audio/mpeg", name: "audio.mp3" });
    const clipId = bindMediaAssetToTimeline(audio);
    const after = useTimelineStore.getState();

    expect(clipId).toBeNull();
    expect(after.clips).toHaveLength(0);
    expect(after.assetsMap["asset-audio-1"]).toBeUndefined();
  });
});
