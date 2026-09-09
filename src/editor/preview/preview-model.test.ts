import { describe, expect, it } from "vitest";
import type { MediaClip, TextClip, TimelineTrack } from "../types/andrew-core";
import { getActivePreviewClips, getMediaTime } from "./preview-model";

const track = (id: string, order: number, visible = true): TimelineTrack => ({
  id, order, visible, name: id, muted: false, locked: false,
});

const baseTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 };
const adjustments = { opacity: 1, brightness: 1, contrast: 1, saturation: 1 };

const media = (id: string, startTime: number, duration: number, zIndex: number): MediaClip => ({
  id, type: "media", assetId: `asset-${id}`, trackId: "v1", startTime, duration,
  trimStart: 2, trimEnd: 0, transform: baseTransform, adjustments, zIndex,
});

const text = (id: string, startTime: number): TextClip => ({
  id, type: "text", trackId: "v1", startTime, duration: 2, textContent: id,
  fontConfig: { family: "sans-serif", size: 32, weight: 400, style: "normal", color: "#fff", align: "left", lineHeight: 1.2 },
  transform: baseTransform, adjustments, zIndex: 10,
});

describe("preview-model", () => {
  it("selects only clips active at the preview time and orders them", () => {
    const clips = [media("late", 5, 2, 2), text("text", 1), media("base", 0, 4, 1)];
    const result = getActivePreviewClips(clips, [track("v1", 0)], 2);
    expect(result.map((clip) => clip.id)).toEqual(["base", "text"]);
  });

  it("ignores clips on hidden or missing tracks", () => {
    const clips = [media("hidden", 0, 3, 1), media("missing", 0, 3, 2)];
    const result = getActivePreviewClips(clips, [track("v1", 0, false)], 1);
    expect(result).toHaveLength(0);
  });

  it("maps timeline time to trimmed media time", () => {
    expect(getMediaTime(media("m", 10, 5, 0), 12.5)).toBe(4.5);
  });
});
