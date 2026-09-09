import type { AssetLoadOptions, AssetLoadResult, AssetManager as AssetManagerContract, AssetType, AssetElement, ManagedAsset, UUID } from "../types/andrew-core";
import { useTimelineStore } from "../timeline/timeline-store";

const detectType = (mime: string): AssetType => mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "audio";
const waitMedia = (element: HTMLMediaElement): Promise<void> => new Promise((resolve, reject) => { const done = (): void => { cleanup(); resolve(); }; const fail = (): void => { cleanup(); reject(new Error("No se pudo cargar el medio.")); }; const cleanup = (): void => { element.removeEventListener("loadedmetadata", done); element.removeEventListener("error", fail); }; element.addEventListener("loadedmetadata", done, { once: true }); element.addEventListener("error", fail, { once: true }); });

export class AssetManager implements AssetManagerContract {
  private readonly assets = new Map<UUID, ManagedAsset>();
  private readonly hiddenRoot: HTMLDivElement | null;

  constructor() {
    if (typeof document !== "undefined") { const root = document.createElement("div"); root.setAttribute("aria-hidden","true"); root.style.position="fixed"; root.style.width="1px"; root.style.height="1px"; root.style.overflow="hidden"; root.style.opacity="0"; root.style.pointerEvents="none"; root.style.left="-10000px"; document.body.appendChild(root); this.hiddenRoot=root; } else this.hiddenRoot=null;
  }

  async load(file: File, options: AssetLoadOptions = {}): Promise<AssetLoadResult> {
    if (typeof window === "undefined") throw new Error("AssetManager requiere un entorno de navegador.");
    const id = options.id ?? crypto.randomUUID();
    const type = detectType(file.type);
    const url = URL.createObjectURL(file);
    let element: AssetElement | undefined;
    let bitmap: ImageBitmap | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    try {
      if (type === "image") {
        const image = new Image(); image.decoding="async"; image.src=url; await image.decode(); element=image; width=image.naturalWidth; height=image.naturalHeight; if (typeof createImageBitmap === "function") bitmap=await createImageBitmap(file);
      } else if (type === "video") {
        const video=document.createElement("video"); video.preload=options.preload === false ? "metadata" : "auto"; video.muted=true; video.playsInline=true; video.src=url; this.hiddenRoot?.appendChild(video); await waitMedia(video); width=video.videoWidth; height=video.videoHeight; duration=Number.isFinite(video.duration) ? video.duration : undefined; element=video; if (options.preload !== false) { try { await video.play(); video.pause(); } catch { } }
      } else {
        const audio=document.createElement("audio"); audio.preload="metadata"; audio.src=url; this.hiddenRoot?.appendChild(audio); await waitMedia(audio); duration=Number.isFinite(audio.duration) ? audio.duration : undefined; element=audio;
      }
      const asset: ManagedAsset={ id, name: options.name ?? file.name, type, mimeType:file.type || "application/octet-stream", size:file.size, width, height, duration, url, source:file, element, bitmap };
      this.assets.set(id,asset); useTimelineStore.getState().setAsset(asset); return { asset };
    } catch (error) { URL.revokeObjectURL(url); if (element instanceof HTMLElement) element.remove(); bitmap?.close(); throw error instanceof Error ? error : new Error(String(error)); }
  }

  remove(id: UUID): void { const asset=this.assets.get(id) ?? useTimelineStore.getState().assetsMap[id]; if (!asset) return; if (asset.element instanceof HTMLElement) asset.element.remove(); asset.element?.pause?.(); asset.bitmap?.close(); if (asset.url) URL.revokeObjectURL(asset.url); this.assets.delete(id); useTimelineStore.getState().removeAsset(id); }
  get(id: UUID): ManagedAsset | undefined { return this.assets.get(id) ?? useTimelineStore.getState().assetsMap[id]; }
  clear(): void { for (const id of [...this.assets.keys()]) this.remove(id); }
  dispose(): void { this.clear(); this.hiddenRoot?.remove(); }
}

export const assetManager = new AssetManager();
export default assetManager;
