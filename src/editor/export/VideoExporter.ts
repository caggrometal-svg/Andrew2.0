import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { EncodedVideoChunkMetadata, Muxer as MuxerType } from "mp4-muxer";
import type { ExportDimensions, ExportProgress, TimelineClip, VideoExportCallbacks, VideoExportOptions, VideoExportResult } from "../types/andrew-core";
import { useTimelineStore } from "../timeline/timeline-store";
import WebGLRenderer from "../renderer/WebGLRenderer";

interface VideoFrameLike { close(): void }
interface VideoFrameConstructor { new(source: CanvasImageSource, init: { timestamp: number; duration?: number }): VideoFrameLike }
interface EncoderChunkLike { type: "key" | "delta"; timestamp: number; duration?: number; byteLength: number; copyTo(destination: ArrayBufferView): void }
interface EncoderConfig { codec: string; width: number; height: number; bitrate: number; framerate: number; hardwareAcceleration?: "prefer-hardware" | "prefer-software" }
interface VideoEncoderLike { configure(config: EncoderConfig): void; encode(frame: VideoFrameLike, options?: { keyFrame?: boolean }): void; flush(): Promise<void>; close(): void }
interface VideoEncoderConstructor { new(init: { output: (chunk: EncoderChunkLike, metadata: EncodedVideoChunkMetadata) => void; error: (error: DOMException) => void }): VideoEncoderLike; isConfigSupported?: (config: EncoderConfig) => Promise<unknown> }

const dimensions = (options: VideoExportOptions): ExportDimensions => ({ width: Math.max(2, Math.floor((options.width ?? 1920) / 2) * 2), height: Math.max(2, Math.floor((options.height ?? 1080) / 2) * 2) });
const progress = (frame: number, total: number, time: number, duration: number): ExportProgress => ({ currentFrame: frame, totalFrames: total, percentage: total <= 1 ? 100 : Math.min(100, frame / (total - 1) * 100), currentTime: time, duration });
const abortError = (): DOMException => new DOMException("Exportación cancelada.", "AbortError");
const getEncoder = (): VideoEncoderConstructor => { const ctor = (globalThis as unknown as { VideoEncoder?: VideoEncoderConstructor }).VideoEncoder; if (!ctor) throw new Error("WebCodecs VideoEncoder no está disponible en este navegador."); return ctor; };
const getFrameConstructor = (): VideoFrameConstructor => { const ctor = (globalThis as unknown as { VideoFrame?: VideoFrameConstructor }).VideoFrame; if (!ctor) throw new Error("WebCodecs VideoFrame no está disponible en este navegador."); return ctor; };
const waitVideoFrame = async (element: HTMLVideoElement): Promise<void> => { if (element.readyState < 2) await new Promise<void>((resolve, reject) => { const done = (): void => { cleanup(); resolve(); }; const fail = (): void => { cleanup(); reject(new Error("No se pudo preparar el fotograma de vídeo.")); }; const cleanup = (): void => { element.removeEventListener("canplay", done); element.removeEventListener("error", fail); }; element.addEventListener("canplay", done, { once: true }); element.addEventListener("error", fail, { once: true }); }); if (typeof element.requestVideoFrameCallback === "function") await new Promise<void>((resolve) => { element.requestVideoFrameCallback(() => resolve()); }); };
const triggerDownload = (blob: Blob, filename: string): void => { if (typeof document === "undefined") throw new Error("La descarga requiere un entorno de navegador."); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); };

export class VideoExporter {
  private cancelled = false;
  private exporting = false;

  cancel(): void { this.cancelled = true; }

  async export(options: VideoExportOptions = {}, callbacks: VideoExportCallbacks = {}): Promise<VideoExportResult> {
    if (this.exporting) throw new Error("Ya existe una exportación en curso.");
    if (typeof document === "undefined") throw new Error("La exportación requiere un entorno de navegador.");
    this.exporting = true; this.cancelled = false;
    const state = useTimelineStore.getState(); const fps = Math.max(1, Math.min(240, Math.round(options.fps ?? state.fps))); const duration = Math.max(0, state.duration); const totalFrames = Math.max(1, Math.ceil(duration * fps)); const size = dimensions(options); const filename = options.filename ?? "andrew-export.mp4";
    let renderer: WebGLRenderer | undefined; let encoder: VideoEncoderLike | undefined; let muxer: MuxerType | undefined;
    try {
      callbacks.onStatusChange?.("preparing");
      const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
      renderer = new WebGLRenderer(canvas); renderer.resize(size.width, size.height);
      const target = new ArrayBufferTarget(); muxer = new Muxer({ target, fastStart: "in-memory", video: { codec: "avc", width: size.width, height: size.height, frameRate: fps } });
      const Encoder = getEncoder(); const Frame = getFrameConstructor(); let encoderError: Error | undefined;
      encoder = new Encoder({ output: (chunk, metadata) => { if (!muxer) return; muxer.addVideoChunk(chunk as Parameters<MuxerType["addVideoChunk"]>[0], metadata); }, error: (error) => { encoderError = error instanceof Error ? error : new Error(String(error)); } });
      const config: EncoderConfig = { codec: "avc1.42001E", width: size.width, height: size.height, bitrate: Math.max(100_000, options.bitrate ?? 8_000_000), framerate: fps, hardwareAcceleration: "prefer-hardware" };
      if (Encoder.isConfigSupported) await Encoder.isConfigSupported(config);
      encoder.configure(config);
      callbacks.onStatusChange?.("rendering");
      const clips: readonly TimelineClip[] = state.clips.map((clip) => ({ ...clip, transform: { ...clip.transform }, adjustments: { ...clip.adjustments } }));
      const frameDuration = Math.round(1_000_000 / fps);
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        if (this.cancelled) throw abortError();
        const timestamp = Math.round((frameIndex / fps) * 1_000_000); const time = Math.min(duration, frameIndex / fps);
        renderer.setClips(clips); renderer.setTime(time);
        for (const clip of clips) if (clip.type === "media" && time >= clip.startTime && time < clip.startTime + clip.duration) { const video = useTimelineStore.getState().assetsMap[clip.assetId]?.element; if (video instanceof HTMLVideoElement) await waitVideoFrame(video); }
        if (encoderError) throw encoderError;
        renderer.render();
        const frame = new Frame(canvas, { timestamp, duration: frameDuration });
        try { encoder.encode(frame, { keyFrame: frameIndex === 0 || frameIndex % Math.max(1, fps * 2) === 0 }); } finally { frame.close(); }
        callbacks.onProgress?.(progress(frameIndex, totalFrames, time, duration));
      }
      if (this.cancelled) throw abortError();
      callbacks.onStatusChange?.("finalizing"); await encoder.flush(); if (encoderError) throw encoderError; muxer.finalize();
      const buffer = target.buffer.slice(0); const blob = new Blob([buffer], { type: "video/mp4" }); const result: VideoExportResult = { blob, mimeType: "video/mp4", filename, duration, width: size.width, height: size.height, fps, frames: totalFrames };
      callbacks.onProgress?.(progress(totalFrames, totalFrames, duration, duration)); callbacks.onStatusChange?.("completed"); callbacks.onComplete?.(result); return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") { callbacks.onStatusChange?.("cancelled"); throw error; }
      const normalized = error instanceof Error ? error : new Error(String(error)); callbacks.onStatusChange?.("error"); callbacks.onError?.(normalized); throw normalized;
    } finally { try { encoder?.close(); } catch { /* encoder may already be closed */ } renderer?.dispose(); this.exporting = false; }
  }

  download(result: VideoExportResult): void { triggerDownload(result.blob, result.filename); }
}

export const videoExporter = new VideoExporter();
export default videoExporter;
