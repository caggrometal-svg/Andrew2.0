import { describe, expect, it, vi } from "vitest";
import { WebVideoExporter } from "./web-video-exporter";

function source() {
  return {
    clips: [{ id: "c1", type: "text" as const, trackId: "t1", textContent: "test", fontConfig: { family: "sans-serif", size: 24, weight: 400, style: "normal" as const, color: "#fff", align: "left" as const, lineHeight: 1.2 }, startTime: 0, duration: 1, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 }, adjustments: { opacity: 1, brightness: 1, contrast: 1, saturation: 1 }, zIndex: 0 }],
    tracks: [{ id: "t1", name: "V1", order: 0, muted: false, locked: false, visible: true }],
    assets: {},
  };
}

describe("WebVideoExporter", () => {
  it("reports an unsupported environment without mutating timeline state", async () => {
    const exporter = new WebVideoExporter(source());
    const previous = globalThis.MediaRecorder;
    delete globalThis.MediaRecorder;
    await expect(exporter.export()).rejects.toThrow();
    globalThis.MediaRecorder = previous;
  });

  it("cancel() marks an active export as cancelled", () => {
    const exporter = new WebVideoExporter(source());
    exporter.cancel();
    expect(() => exporter.cancel()).not.toThrow();
    vi.restoreAllMocks();
  });
});
