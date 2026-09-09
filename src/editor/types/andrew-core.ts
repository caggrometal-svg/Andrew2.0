export type UUID = string;
export type Seconds = number;
export type Pixels = number;
export type Frames = number;
export type Degrees = number;
export type AssetType = "image" | "video" | "audio";

export interface Transform2D { x: number; y: number; scaleX: number; scaleY: number; rotation: Degrees; anchorX: number; anchorY: number }
export interface Adjustments { opacity: number; brightness: number; contrast: number; saturation: number }
export interface FontConfig { family: string; size: number; weight: number | string; style: "normal" | "italic"; color: string; align: "left" | "center" | "right"; lineHeight: number }

export interface MediaClip { id: UUID; type: "media"; assetId: UUID; trackId: UUID; startTime: Seconds; duration: Seconds; trimStart: Seconds; trimEnd: Seconds; transform: Transform2D; adjustments: Adjustments; zIndex: number }
export interface TextClip { id: UUID; type: "text"; trackId: UUID; textContent: string; fontConfig: FontConfig; startTime: Seconds; duration: Seconds; transform: Transform2D; adjustments: Adjustments; zIndex: number }
export type TimelineClip = MediaClip | TextClip;
export type TimelineClipPatch = Partial<MediaClip> | Partial<TextClip>;

export interface TimelineTrack { id: UUID; name: string; order: number; muted: boolean; locked: boolean; visible: boolean }
export interface TimelineState { tracks: TimelineTrack[]; clips: TimelineClip[]; selectedClipId: UUID | null; selectedTrackId: UUID | null; currentTime: Seconds; duration: Seconds; fps: number; isPlaying: boolean; playing: boolean; loop: boolean; zoom: number }
export type SerializableTimelineState = TimelineState;

export interface AssetMetadata { id: UUID; name: string; type: AssetType; mimeType: string; size: number; width?: number; height?: number; duration?: Seconds; url?: string }
export type AssetElement = HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
export interface ManagedAsset extends AssetMetadata { source: Blob | File; element?: AssetElement; bitmap?: ImageBitmap }
export type AssetsMap = Record<UUID, ManagedAsset>;

export interface Renderer { resize(width: number, height: number): void; setTime(time: Seconds): void; setClips(clips: readonly TimelineClip[]): void; render(): void; deleteAssetTexture(assetId: UUID): void; dispose(): void }
export interface AssetLoadOptions { id?: UUID; name?: string; preload?: boolean }
export interface AssetLoadResult { asset: ManagedAsset }
export interface AssetManager { load(file: File, options?: AssetLoadOptions): Promise<AssetLoadResult>; remove(id: UUID): void; get(id: UUID): ManagedAsset | undefined; clear(): void; dispose(): void }

export interface TimelineStoreActions {
  addTrack(track?: Partial<TimelineTrack>): UUID;
  removeTrack(id: UUID): void;
  updateTrack(id: UUID, patch: Partial<TimelineTrack>): void;
  reorderTrack(id: UUID, order: number): void;
  addClip(clip: Omit<TimelineClip, "id"> & { id?: UUID }): UUID;
  removeClip(id: UUID): void;
  updateClip(id: UUID, patch: TimelineClipPatch): void;
  moveClip(id: UUID, startTime: Seconds, trackId?: UUID): void;
  play(): void;
  pause(): void;
  seek(time: Seconds): void;
  setCurrentTime(time: Seconds): void;
  setDuration(duration: Seconds): void;
  setFPS(fps: number): void;
  togglePlay(): void;
  setPlaying(playing: boolean): void;
  setLoop(loop: boolean): void;
  setZoom(zoom: number): void;
  selectClip(id?: UUID | null): void;
  selectTrack(id?: UUID | null): void;
  clear(): void;
  load(state: SerializableTimelineState): void;
  setAsset(asset: ManagedAsset): void;
  removeAsset(id: UUID): void;
  getSerializableTimelineState(): SerializableTimelineState;
}
export type TimelineStoreContract = TimelineState & TimelineStoreActions & { assetsMap: AssetsMap };

export interface ExportDimensions { width: number; height: number }
export interface ExportProgress { currentFrame: Frames; totalFrames: Frames; percentage: number; currentTime: Seconds; duration: Seconds }
export type ExportStatus = "idle" | "preparing" | "rendering" | "finalizing" | "completed" | "cancelled" | "error";
export interface VideoExportOptions { width?: number; height?: number; fps?: number; bitrate?: number; mimeType?: string; filename?: string }
export interface VideoExportResult { blob: Blob; mimeType: string; filename: string; duration: Seconds; width: Pixels; height: Pixels; fps: number; frames: Frames }
export interface VideoExportCallbacks { onProgress?: (progress: ExportProgress) => void; onStatusChange?: (status: ExportStatus) => void; onComplete?: (result: VideoExportResult) => void; onError?: (error: Error) => void }
export interface VideoExporter { export(options?: VideoExportOptions, callbacks?: VideoExportCallbacks): Promise<VideoExportResult>; cancel(): void; download(result: VideoExportResult): void }
