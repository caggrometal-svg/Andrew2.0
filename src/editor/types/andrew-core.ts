export type UUID = string;
export type Seconds = number;
export type Pixels = number;
export type Frames = number;
export type Degrees = number;
export type Ratio = number;

export type AssetType = "image" | "video" | "audio";
export type ClipKind = "media" | "text" | "shape";
export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "difference";

export interface Vec2 { x: number; y: number }
export interface Transform2D { x: number; y: number; scaleX: number; scaleY: number; rotation: Degrees; anchorX: number; anchorY: number }
export interface ColorFilters { brightness: number; contrast: number; saturation: number; hue: Degrees; blur: number; grayscale: number; sepia: number; invert: number }
export interface ClipAppearance { opacity: number; blendMode: BlendMode }
export interface ClipEffects { filters: ColorFilters }

export interface TimelineClip {
  id: UUID;
  assetId: UUID;
  trackId: UUID;
  kind: ClipKind;
  name: string;
  start: Seconds;
  duration: Seconds;
  sourceStart: Seconds;
  sourceDuration?: Seconds;
  speed: Ratio;
  volume: Ratio;
  transform: Transform2D;
  appearance: ClipAppearance;
  effects: ClipEffects;
  text?: string;
}

export interface TimelineTrack { id: UUID; name: string; order: number; muted: boolean; locked: boolean; visible: boolean }
export interface TimelineState { tracks: TimelineTrack[]; clips: TimelineClip[]; selectedClipId?: UUID; selectedTrackId?: UUID; currentTime: Seconds; duration: Seconds; fps: number; playing: boolean; loop: boolean; zoom: number }
export type SerializableTimelineState = TimelineState;

export interface ExportDimensions { width: number; height: number }
export interface ExportProgress { currentFrame: Frames; totalFrames: Frames; percentage: number; currentTime: Seconds; duration: Seconds }
export type ExportStatus = "idle" | "preparing" | "rendering" | "finalizing" | "completed" | "cancelled" | "error";
export interface VideoExportOptions { width?: number; height?: number; fps?: number; bitrate?: number; mimeType?: string; filename?: string }
export interface VideoExportResult { blob: Blob; mimeType: string; filename: string; duration: Seconds; width: Pixels; height: Pixels; fps: number; frames: Frames }
export interface VideoExportCallbacks { onProgress?: (progress: ExportProgress) => void; onStatusChange?: (status: ExportStatus) => void; onComplete?: (result: VideoExportResult) => void; onError?: (error: Error) => void }

export interface AssetMetadata { id: UUID; name: string; type: AssetType; mimeType: string; size: number; width?: number; height?: number; duration?: Seconds; url?: string }
export interface ManagedAsset extends AssetMetadata { source: Blob | File; element?: AssetElement; bitmap?: ImageBitmap }
export type AssetElement = HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
export type AssetsMap = Record<UUID, ManagedAsset>;

export interface RendererLayer { clip: TimelineClip; asset?: ManagedAsset; localTime: Seconds; zIndex: number }
export interface RendererFrame { time: Seconds; width: Pixels; height: Pixels; layers: RendererLayer[] }
export interface RendererOptions { width: Pixels; height: Pixels; alpha?: boolean; antialias?: boolean }
export interface Renderer { resize(width: number, height: number): void; setTime(time: Seconds): void; setClips(clips: readonly TimelineClip[]): void; render(): void; dispose(): void }

export interface AssetLoadOptions { id?: UUID; name?: string; preload?: boolean }
export interface AssetLoadResult { asset: ManagedAsset }
export interface AssetManager { load(file: File, options?: AssetLoadOptions): Promise<AssetLoadResult>; remove(id: UUID): void; get(id: UUID): ManagedAsset | undefined; clear(): void }

export interface TimelineStoreActions {
  addTrack(track?: Partial<TimelineTrack>): UUID;
  removeTrack(id: UUID): void;
  updateTrack(id: UUID, patch: Partial<TimelineTrack>): void;
  reorderTrack(id: UUID, order: number): void;
  addClip(clip: Omit<TimelineClip, "id"> & { id?: UUID }): UUID;
  removeClip(id: UUID): void;
  updateClip(id: UUID, patch: Partial<TimelineClip>): void;
  moveClip(id: UUID, start: Seconds, trackId?: UUID): void;
  seek(time: Seconds): void;
  setCurrentTime(time: Seconds): void;
  setDuration(duration: Seconds): void;
  setFPS(fps: number): void;
  togglePlay(): void;
  setPlaying(playing: boolean): void;
  setLoop(loop: boolean): void;
  setZoom(zoom: number): void;
  selectClip(id?: UUID): void;
  selectTrack(id?: UUID): void;
  clear(): void;
  load(state: SerializableTimelineState): void;
}
export type TimelineStoreContract = TimelineState & TimelineStoreActions & { assetsMap: AssetsMap; setAsset(asset: ManagedAsset): void; removeAsset(id: UUID): void; getSerializableTimelineState(): SerializableTimelineState };

export interface VideoExporter { export(options?: VideoExportOptions, callbacks?: VideoExportCallbacks): Promise<VideoExportResult>; cancel(): void; download(result: VideoExportResult): void }
