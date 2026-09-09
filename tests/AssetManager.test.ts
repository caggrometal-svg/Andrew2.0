import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetManager } from "../src/editor/managers/AssetManager";
import { useTimelineStore } from "../src/editor/timeline/timeline-store";
import type { ManagedAsset } from "../src/editor/types/andrew-core";

const asset = (id: string): ManagedAsset => ({
  id,
  name: "sample.png",
  type: "image",
  mimeType: "image/png",
  size: 128,
  source: new Blob(["asset"], { type: "image/png" }),
  url: "blob:http://localhost/test-asset",
});

describe("AssetManager", () => {
  beforeEach(() => {
    useTimelineStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("registra un asset mediante setAsset y lo expone en assetsMap", () => {
    const managed = asset("asset-1");

    useTimelineStore.getState().setAsset(managed);

    expect(useTimelineStore.getState().assetsMap["asset-1"]).toBe(managed);
    expect(useTimelineStore.getState().assetsMap["asset-1"].type).toBe("image");
  });

  it("removeAsset desasigna el asset del store", () => {
    const managed = asset("asset-1");
    useTimelineStore.getState().setAsset(managed);

    useTimelineStore.getState().removeAsset("asset-1");

    expect(useTimelineStore.getState().assetsMap["asset-1"]).toBeUndefined();
  });

  it("remove revoca Object URL, libera ImageBitmap, destruye textura GPU y desasigna el asset", () => {
    const manager = new AssetManager();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const element = document.createElement("img");
    const managed = { ...asset("asset-1"), bitmap, element };
    const deleteAssetTexture = vi.fn();
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    useTimelineStore.getState().setAsset(managed);
    manager.registerRenderer({ deleteAssetTexture });

    manager.remove("asset-1");

    expect(deleteAssetTexture).toHaveBeenCalledTimes(1);
    expect(deleteAssetTexture).toHaveBeenCalledWith("asset-1");
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(managed.url);
    expect(useTimelineStore.getState().assetsMap["asset-1"]).toBeUndefined();
  });

  it("mantiene las guardas de navegador: load falla limpiamente sin window/document", async () => {
    const manager = new AssetManager();
    const file = new File(["asset"], "sample.png", { type: "image/png" });

    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);

    await expect(manager.load(file)).rejects.toThrow("AssetManager requiere un entorno de navegador");

    vi.unstubAllGlobals();
  });
});
