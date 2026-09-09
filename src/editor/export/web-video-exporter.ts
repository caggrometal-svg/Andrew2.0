import type {
  ExportProgress,
  VideoExportCallbacks,
  VideoExportOptions,
  VideoExportResult,
  VideoExporter,
} from "../types/andrew-core";
import type { TimelineClip, TimelineTrack, ManagedAsset } from "../types/andrew-core";
import { getActivePreviewClips } from "../preview/preview-model";

interface ExportSource {
  clips: readonly TimelineClip[];
  tracks: readonly TimelineTrack[];
  assets: Record<string, ManagedAsset>;
}

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function supportedMime(requested?: string): string {
  const candidates = requested
    ? [requested]
    : ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  throw new Error("No compatible MediaRecorder video MIME type is available");
}

export class WebVideoExporter implements VideoExporter {
  private cancelled = false;
  private recorder?: MediaRecorder;

  constructor(private readonly source: ExportSource) {}

  async export(options: VideoExportOptions = {}, callbacks: VideoExportCallbacks = {}): Promise<VideoExportResult> {
    this.cancelled = false;
    callbacks.onStatusChange?.("preparing");

    const width = Math.max(1, Math.floor(options.width ?? 1920));
    const height = Math.max(1, Math.floor(options.height ?? 1080));
    const fps = Math.min(60, Math.max(1, Math.floor(options.fps ?? 30)));
    const duration = Math.max(0, this.source.clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0));
    const totalFrames = Math.max(1, Math.ceil(duration * fps));
    const mimeType = supportedMime(options.mimeType);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const stream = canvas.captureStream(fps);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, ...(options.bitrate ? { videoBitsPerSecond: options.bitrate } : {}) });
    this.recorder = recorder;

    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.onerror = () => reject(recorder.error ?? new Error("MediaRecorder export failed"));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    recorder.start(250);
    callbacks.onStatusChange?.("rendering");

    for (let frame = 0; frame < totalFrames; frame += 1) {
      if (this.cancelled) {
        recorder.stop();
        callbacks.onStatusChange?.("cancelled");
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException("Export cancelled", "AbortError");
      }

      const time = Math.min(duration, frame / fps);
      this.drawFrame(ctx, canvas, time);
      callbacks.onProgress?.({
        currentFrame: frame,
        totalFrames,
        percentage: (frame / totalFrames) * 100,
        currentTime: time,
        duration,
      } satisfies ExportProgress);

      // Prevent monopolizing the UI thread on long exports.
      if ((frame & 3) === 3) await yieldToBrowser();
    }

    recorder.stop();
    const blob = await finished;
    stream.getTracks().forEach((track) => track.stop());
    callbacks.onStatusChange?.("finalizing");

    const result: VideoExportResult = {
      blob,
      mimeType,
      filename: options.filename ?? `andrew2-export.${mimeType.includes("mp4") ? "mp4" : "webm"}`,
      duration,
      width,
      height,
      fps,
      frames: totalFrames,
    };
    callbacks.onStatusChange?.("completed");
    callbacks.onComplete?.(result);
    return result;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
  }

  download(result: VideoExportResult): void {
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private drawFrame(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, time: number): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const active = getActivePreviewClips(this.source.clips, this.source.tracks, time);

    for (const clip of active) {
      if (clip.type === "media") {
        const asset = this.source.assets[clip.assetId];
        const element = asset?.element;
        if (!(element instanceof HTMLVideoElement || element instanceof HTMLImageElement)) continue;
        const w = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
        const h = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
        if (!w || !h) continue;
        const targetW = w * clip.transform.scaleX;
        const targetH = h * clip.transform.scaleY;
        ctx.save();
        ctx.globalAlpha = clip.adjustments.opacity;
        ctx.translate(clip.transform.x + targetW * clip.transform.anchorX, clip.transform.y + targetH * clip.transform.anchorY);
        ctx.rotate((clip.transform.rotation * Math.PI) / 180);
        ctx.translate(-targetW * clip.transform.anchorX, -targetH * clip.transform.anchorY);
        ctx.drawImage(element, 0, 0, targetW, targetH);
        ctx.restore();
      }
    }
  }
}
