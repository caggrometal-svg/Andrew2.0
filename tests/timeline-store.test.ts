import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimelineStore } from "../src/editor/timeline/timeline-store";
import type { MediaClip, TextClip, Transform2D, Adjustments } from "../src/editor/types/andrew-core";

const transform = (): Transform2D => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 });
const adjustments = (): Adjustments => ({ opacity: 1, brightness: 1, contrast: 1, saturation: 1 });

const mediaClip = (trackId: string, overrides: Partial<MediaClip> = {}): Omit<MediaClip, "id"> => ({
  type: "media", assetId: "asset-1", trackId, startTime: 0, duration: 5, trimStart: 0, trimEnd: 0,
  transform: transform(), adjustments: adjustments(), zIndex: 0, ...overrides,
});

const textClip = (trackId: string): Omit<TextClip, "id"> => ({
  type: "text", trackId, textContent: "Andrew2.0",
  fontConfig: { family: "Arial", size: 48, weight: 700, style: "normal", color: "#ffffff", align: "center", lineHeight: 1.2 },
  startTime: 1, duration: 3, transform: transform(), adjustments: adjustments(), zIndex: 1,
});

describe("timeline-store", () => {
  beforeEach(() => useTimelineStore.getState().clear());
  afterEach(() => useTimelineStore.getState().clear());

  it("expone la tienda Zustand como hook React consumible", () => {
    const { result } = renderHook(() => useTimelineStore((state) => ({ duration: state.duration, clips: state.clips })));
    expect(result.current.duration).toBe(0);
    expect(result.current.clips).toEqual([]);

    const trackId = useTimelineStore.getState().tracks[0].id;
    act(() => { useTimelineStore.getState().addClip(mediaClip(trackId)); });
    expect(result.current.clips).toHaveLength(1);
  });

  it("agrega clips y selecciona el clip creado", () => {
    const trackId = useTimelineStore.getState().tracks[0].id;
    const clipId = useTimelineStore.getState().addClip(mediaClip(trackId));
    const state = useTimelineStore.getState();
    expect(state.clips).toHaveLength(1);
    expect(state.clips[0]).toMatchObject({ id: clipId, type: "media", assetId: "asset-1" });
    expect(state.selectedClipId).toBe(clipId);
    expect(state.duration).toBe(5);
  });

  it("mueve un clip horizontalmente y entre pistas", () => {
    const store = useTimelineStore.getState();
    const firstTrackId = store.tracks[0].id;
    const secondTrackId = store.addTrack({ name: "Video 2" });
    const clipId = store.addClip(mediaClip(firstTrackId));
    useTimelineStore.getState().moveClip(clipId, 7.5, secondTrackId);
    const clip = useTimelineStore.getState().clips[0];
    expect(clip.startTime).toBe(7.5);
    expect(clip.trackId).toBe(secondTrackId);
    expect(useTimelineStore.getState().duration).toBe(12.5);
  });

  it("actualiza transformaciones y filtros sin cambiar el tipo del clip", () => {
    const trackId = useTimelineStore.getState().tracks[0].id;
    const clipId = useTimelineStore.getState().addClip(mediaClip(trackId));
    useTimelineStore.getState().updateClip(clipId, {
      transform: { ...transform(), x: 120, rotation: 35, scaleX: 1.4, scaleY: 0.8 },
      adjustments: { ...adjustments(), brightness: 1.25, contrast: 1.15, saturation: 0.75, opacity: 0.6 },
    });
    const clip = useTimelineStore.getState().clips[0];
    expect(clip.type).toBe("media");
    expect(clip.transform).toMatchObject({ x: 120, rotation: 35, scaleX: 1.4, scaleY: 0.8 });
    expect(clip.adjustments).toMatchObject({ brightness: 1.25, contrast: 1.15, saturation: 0.75, opacity: 0.6 });
  });

  it("mantiene la duración global fijada aunque un clip existente se reduzca o se desplace dentro de ella", () => {
    const trackId = useTimelineStore.getState().tracks[0].id;
    const clipId = useTimelineStore.getState().addClip(mediaClip(trackId, { duration: 4 }));
    useTimelineStore.getState().setDuration(20);
    useTimelineStore.getState().updateClip(clipId, { duration: 2, startTime: 3 });
    expect(useTimelineStore.getState().duration).toBe(20);
  });

  it("extiende la duración global únicamente cuando el clip supera su límite físico", () => {
    const trackId = useTimelineStore.getState().tracks[0].id;
    const clipId = useTimelineStore.getState().addClip(mediaClip(trackId, { duration: 2 }));
    useTimelineStore.getState().setDuration(10);
    useTimelineStore.getState().updateClip(clipId, { startTime: 9, duration: 3 });
    expect(useTimelineStore.getState().duration).toBe(12);
  });

  it("elimina clips y limpia la selección asociada", () => {
    const trackId = useTimelineStore.getState().tracks[0].id;
    const clipId = useTimelineStore.getState().addClip(mediaClip(trackId));
    useTimelineStore.getState().removeClip(clipId);
    expect(useTimelineStore.getState().clips).toHaveLength(0);
    expect(useTimelineStore.getState().selectedClipId).toBeUndefined();
    expect(useTimelineStore.getState().duration).toBe(5);
  });

  it("cambia y cancela selectedClipId", () => {
    const trackId = useTimelineStore.getState().tracks[0].id;
    const firstId = useTimelineStore.getState().addClip(mediaClip(trackId));
    const secondId = useTimelineStore.getState().addClip(textClip(trackId));
    useTimelineStore.getState().selectClip(firstId);
    expect(useTimelineStore.getState().selectedClipId).toBe(firstId);
    useTimelineStore.getState().selectClip(secondId);
    expect(useTimelineStore.getState().selectedClipId).toBe(secondId);
    useTimelineStore.getState().selectClip(undefined);
    expect(useTimelineStore.getState().selectedClipId).toBeUndefined();
  });

  it("resetea completamente el proyecto con clear", () => {
    const store = useTimelineStore.getState();
    const trackId = store.tracks[0].id;
    store.addTrack({ name: "Video 2" });
    store.addClip(mediaClip(trackId));
    store.addClip(textClip(trackId));
    useTimelineStore.getState().setDuration(30);
    useTimelineStore.getState().setCurrentTime(10);
    useTimelineStore.getState().setFPS(60);
    useTimelineStore.getState().setZoom(3);
    useTimelineStore.getState().clear();
    const state = useTimelineStore.getState();
    expect(state.clips).toEqual([]);
    expect(state.tracks).toHaveLength(1);
    expect(state.duration).toBe(0);
    expect(state.currentTime).toBe(0);
    expect(state.fps).toBe(30);
    expect(state.playing).toBe(false);
    expect(state.loop).toBe(false);
    expect(state.zoom).toBe(1);
    expect(state.selectedClipId).toBeUndefined();
    expect(state.selectedTrackId).toBeUndefined();
    expect(state.assetsMap).toEqual({});
  });
});
