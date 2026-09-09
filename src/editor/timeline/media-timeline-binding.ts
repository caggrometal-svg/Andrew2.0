import { assetManager } from "../managers/AssetManager";
import { useTimelineStore } from "./timeline-store";
import type { ManagedAsset, MediaClip, UUID } from "../types/andrew-core";

export type MediaKind = "image" | "video" | "audio";

/** Platform-neutral media selected by an importer. The source is deliberately kept
 * as Blob/File so the editor core never needs to know about Android URI schemes. */
export interface MediaAsset {
  id?: UUID;
  uri?: string;
  name: string;
  mimeType: string;
  kind: MediaKind;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  source: Blob | File;
}

export interface BindMediaOptions {
  trackId?: UUID;
  startTime?: number;
  zIndex?: number;
}

const clampNonNegative = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? Math.max(0, value as number) : fallback;

export const toMediaAsset = (file: File): MediaAsset => ({
  name: file.name,
  mimeType: file.type || "application/octet-stream",
  kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "audio",
  size: file.size,
  source: file,
});

export const createMediaClip = (
  asset: ManagedAsset,
  trackId: UUID,
  startTime: number,
  zIndex: number,
): Omit<MediaClip, "id"> => ({
  type: "media",
  assetId: asset.id,
  trackId,
  startTime: clampNonNegative(startTime, 0),
  duration: Math.max(0.1, clampNonNegative(asset.duration, 5)),
  trimStart: 0,
  trimEnd: 0,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
  adjustments: { opacity: 1, brightness: 1, contrast: 1, saturation: 1 },
  zIndex: Math.max(0, Math.floor(zIndex)),
});

const ensureTrack = (): UUID => {
  const store = useTimelineStore.getState();
  const track = store.tracks[0];
  return track?.id ?? store.addTrack({ name: "Pista 1" });
};

/** Registers the managed asset and creates its timeline clip without touching
 * playback/timekeeping or the Zustand store implementation. */
export const bindMediaAssetToTimeline = (
  asset: ManagedAsset,
  options: BindMediaOptions = {},
): UUID | null => {
  if (asset.type === "audio") return null;

  const store = useTimelineStore.getState();
  store.setAsset(asset);

  const trackId = options.trackId ?? ensureTrack();
  const startTime = options.startTime ?? store.duration;
  return store.addClip(createMediaClip(asset, trackId, startTime, options.zIndex ?? store.clips.length));
};

/** End-to-end import adapter for the current browser file picker and for future
 * native adapters that can provide a Blob/File source. */
export const importMediaAssetToTimeline = async (
  mediaAsset: MediaAsset,
  options: BindMediaOptions = {},
): Promise<UUID | null> => {
  const file = mediaAsset.source instanceof File
    ? mediaAsset.source
    : new File([mediaAsset.source], mediaAsset.name, { type: mediaAsset.mimeType });

  const { asset } = await assetManager.load(file, {
    id: mediaAsset.id,
    name: mediaAsset.name,
  });

  const clipId = bindMediaAssetToTimeline(asset, options);
  if (clipId) useTimelineStore.getState().setCurrentTime(asset.type === "audio" ? 0 : options.startTime ?? useTimelineStore.getState().duration - (asset.duration ?? 5));
  return clipId;
};
