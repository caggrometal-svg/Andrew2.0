import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedAsset } from "../editor/types/andrew-core";
import { useTimelineStore } from "../editor/timeline/timeline-store";

const loadMock = vi.fn();

vi.mock("../editor/managers/AssetManager", () => ({
  assetManager: {
    load: loadMock,
  },
}));

import {
  importPlatformMediaAssetToTimeline,
  pickAndImportEditorMedia,
} from "./editor-media-import";

const managedAsset = (overrides: Partial<ManagedAsset> = {}): ManagedAsset => ({
  id: "platform-video-1",
  name: "native-video.mp4",
  type: "video",
  mimeType: "video/mp4",
  size: 128,
  duration: 8,
  source: new Blob(["video"], { type: "video/mp4" }),
  ...overrides,
});

const platformAsset = {
  id: "platform-video-1",
  uri: "file:///media/native-video.mp4",
  name: "native-video.mp4",
  mimeType: "video/mp4",
  kind: "video" as const,
  size: 128,
  duration: 8,
};

describe("editor-media-import", () => {
  beforeEach(() => {
    useTimelineStore.getState().clear();
    loadMock.mockReset();
    loadMock.mockResolvedValue({ asset: managedAsset() });
  });

  it("imports a picked native video and registers it in the timeline store", async () => {
    const readFile = vi.fn().mockResolvedValue(new TextEncoder().encode("native-video").buffer);
    const pickVideo = vi.fn().mockResolvedValue(platformAsset);
    const pickImage = vi.fn();
    const platform = { pickVideo, pickImage, readFile };

    const clipId = await pickAndImportEditorMedia("video", { platform });
    const state = useTimelineStore.getState();

    expect(pickVideo).toHaveBeenCalledOnce();
    expect(pickImage).not.toHaveBeenCalled();
    expect(readFile).toHaveBeenCalledWith(platformAsset.uri);
    expect(loadMock).toHaveBeenCalledOnce();
    expect(loadMock.mock.calls[0][0]).toBeInstanceOf(File);
    expect(loadMock.mock.calls[0][0]).toMatchObject({ name: "native-video.mp4", type: "video/mp4" });
    expect(clipId).toBeTruthy();
    expect(state.assetsMap["platform-video-1"]).toBeDefined();
    expect(state.clips).toHaveLength(1);
    expect(state.clips[0]).toMatchObject({ assetId: "platform-video-1", duration: 8 });
  });

  it("imports a picked image without reading again when the platform already supplies a Blob", async () => {
    const source = new Blob(["image"], { type: "image/jpeg" });
    const image = {
      ...platformAsset,
      id: "platform-image-1",
      uri: "blob:image",
      name: "native-image.jpg",
      mimeType: "image/jpeg",
      kind: "image" as const,
      source,
    };
    const readFile = vi.fn();
    const pickImage = vi.fn().mockResolvedValue(image);
    const platform = {
      pickVideo: vi.fn(),
      pickImage,
      readFile,
    };
    loadMock.mockResolvedValue({ asset: managedAsset({ id: "platform-image-1", name: "native-image.jpg", type: "image", mimeType: "image/jpeg" }) });

    const clipId = await pickAndImportEditorMedia("image", { platform });
    const state = useTimelineStore.getState();

    expect(pickImage).toHaveBeenCalledOnce();
    expect(readFile).not.toHaveBeenCalled();
    expect(clipId).toBeTruthy();
    expect(state.assetsMap["platform-image-1"]).toBeDefined();
    expect(state.clips[0]).toMatchObject({ assetId: "platform-image-1" });
  });

  it("does not mutate the timeline when the platform picker is cancelled", async () => {
    const platform = {
      pickVideo: vi.fn().mockResolvedValue(null),
      pickImage: vi.fn(),
      readFile: vi.fn(),
    };

    const clipId = await pickAndImportEditorMedia("video", { platform });
    const state = useTimelineStore.getState();

    expect(clipId).toBeNull();
    expect(state.assetsMap).toEqual({});
    expect(state.clips).toHaveLength(0);
    expect(loadMock).not.toHaveBeenCalled();
  });

  it("ignores unsupported platform media without touching the editor store", async () => {
    const asset = { ...platformAsset, kind: "audio" as const };
    const platform = {
      pickVideo: vi.fn(),
      pickImage: vi.fn(),
      readFile: vi.fn(),
    };

    const clipId = await importPlatformMediaAssetToTimeline(asset, { platform });
    const state = useTimelineStore.getState();

    expect(clipId).toBeNull();
    expect(state.assetsMap).toEqual({});
    expect(state.clips).toHaveLength(0);
    expect(loadMock).not.toHaveBeenCalled();
  });
});
