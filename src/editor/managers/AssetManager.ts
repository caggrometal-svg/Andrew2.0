import type { AssetElement, AssetLoadOptions, AssetLoadResult, AssetManager as AssetManagerContract, AssetType, ManagedAsset, Renderer, UUID } from "../types/andrew-core";
import { useTimelineStore } from "../timeline/timeline-store";

const detectType = (mime: string): AssetType => mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : "audio";
const waitMetadata = (element: HTMLMediaElement): Promise<void> => new Promise((resolve, reject) => { const done = (): void => { cleanup(); resolve(); }; const fail = (): void => { cleanup(); reject(new Error("No se pudo cargar el medio.")); }; const cleanup = (): void => { element.removeEventListener("loadedmetadata", done); element.removeEventListener("error", fail); }; element.addEventListener("loadedmetadata", done, { once: true }); element.addEventListener("error", fail, { once: true }); });
const removeElement = (element: AssetElement | undefined): void => { if (typeof HTMLElement !== "undefined" && element instanceof HTMLElement) element.remove(); };

export class AssetManager implements AssetManagerContract {
  private readonly assets = new Map<UUID, ManagedAsset>();
  private readonly renderers = new Set<Pick<Renderer, "deleteAssetTexture">>();
  private hiddenRoot: HTMLDivElement | null = null;

  registerRenderer(renderer: Pick<Renderer, "deleteAssetTexture">): () => void { this.renderers.add(renderer); return () => this.renderers.delete(renderer); }

  private ensureRoot(): HTMLDivElement {
    if (typeof document === "undefined") throw new Error("AssetManager requiere un entorno de navegador.");
    if (!this.hiddenRoot) { const root = document.createElement("div"); root.setAttribute("aria-hidden", "true"); root.style.position = "fixed"; root.style.width = "1px"; root.style.height = "1px"; root.style.overflow = "hidden"; root.style.opacity = "0"; root.style.pointerEvents = "none"; root.style.left = "-10000px"; document.body.appendChild(root); this.hiddenRoot = root; }
    return this.hiddenRoot;
  }

  async load(file: File, options: AssetLoadOptions = {}): Promise<AssetLoadResult> {
    if (typeof window === "undefined" || typeof document === "undefined") throw new Error("AssetManager requiere un entorno de navegador.");
    const assetId = options.id ?? crypto.randomUUID();
    const type = detectType(file.type);
    const url = URL.createObjectURL(file);
    let element: AssetElement | undefined;
    let bitmap: ImageBitmap | undefined;
    try {
      if (type === "image") {
        const image = new Image(); image.decoding = "async"; image.src = url; await image.decode(); element = image; if (typeof createImageBitmap === "function") bitmap = await createImageBitmap(file);
      } else if (type === "video") {
        const video = document.createElement("video"); video.preload = options.preload === false ? "metadata" : "auto"; video.muted = true; video.playsInline = true; video.src = url; this.ensureRoot().appendChild(video); await waitMetadata(video); element = video;
      } else {
        const audio = document.createElement("audio"); audio.preload = "metadata"; audio.src = url; this.ensureRoot().appendChild(audio); await waitMetadata(audio); element = audio;
      }
      const asset: ManagedAsset = { id: assetId, name: options.name ?? file.name, type, mimeType: file.type || "application/octet-stream", size: file.size, width: element && "videoWidth" in element ? element.videoWidth : element && "naturalWidth" in element ? element.naturalWidth : undefined, height: element && "videoHeight" in element ? element.videoHeight : element && "naturalHeight" in element ? element.naturalHeight : undefined, duration: element && "duration" in element && Number.isFinite(element.duration) ? element.duration : undefined, url, source: file, element, bitmap };
      this.assets.set(assetId, asset); useTimelineStore.getState().setAsset(asset); return { asset };
    } catch (error) { bitmap?.close(); removeElement(element); URL.revokeObjectURL(url); throw error instanceof Error ? error : new Error(String(error)); }
  }

  remove(id: UUID): void {
    const asset = this.assets.get(id) ?? useTimelineStore.getState().assetsMap[id]; if (!asset) return;
    for (const renderer of this.renderers) renderer.deleteAssetTexture(id);
    asset.bitmap?.close();
    if (asset.element && "pause" in asset.element) asset.element.pause();
    removeElement(asset.element);
    if (asset.url) URL.revokeObjectURL(asset.url);
    this.assets.delete(id); useTimelineStore.getState().removeAsset(id);
  }

  get(id: UUID): ManagedAsset | undefined { return this.assets.get(id) ?? useTimelineStore.getState().assetsMap[id]; }
  clear(): void { for (const asset of [...this.assets.values()]) this.remove(asset.id); }
  dispose(): void { this.clear(); this.renderers.clear(); this.hiddenRoot?.remove(); this.hiddenRoot = null; }
}

export const assetManager = new AssetManager();
export default assetManager;
