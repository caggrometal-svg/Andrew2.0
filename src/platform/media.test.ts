import { describe, expect, it } from "vitest";
import { createMockMediaPlatform } from "./__mocks__/media";
import type { MediaPlatform } from "./media";

const createBytes = (value: string): ArrayBuffer =>
  new TextEncoder().encode(value).buffer;

describe("media platform contract", () => {
  it("reports granted permissions in the default mock", async () => {
    const platform = createMockMediaPlatform();

    await expect(platform.requestVideoAccess()).resolves.toBe("granted");
    await expect(platform.requestImageAccess()).resolves.toBe("granted");
  });

  it("selects a video with normalized metadata", async () => {
    const platform = createMockMediaPlatform();
    const asset = await platform.pickVideo();

    expect(asset).toMatchObject({
      kind: "video",
      mimeType: "video/mp4",
      name: "mock-video.mp4",
      duration: 12,
      width: 1920,
      height: 1080,
    });
    expect(asset?.uri).toBe("mock://mock-video.mp4");
  });

  it("selects an image with normalized metadata", async () => {
    const platform = createMockMediaPlatform();
    const asset = await platform.pickImage();

    expect(asset).toMatchObject({
      kind: "image",
      mimeType: "image/jpeg",
      name: "mock-image.jpg",
      width: 1920,
      height: 1080,
    });
  });

  it("reads the selected media as an ArrayBuffer", async () => {
    const platform: MediaPlatform = createMockMediaPlatform({
      readFile: async () => createBytes("hello-media"),
    });

    const bytes = await platform.readFile("mock://media");
    expect(new TextDecoder().decode(bytes)).toBe("hello-media");
  });

  it("supports permission denial without coupling tests to Android", async () => {
    const platform = createMockMediaPlatform({
      requestVideoAccess: async () => "denied",
      pickVideo: async () => null,
    });

    await expect(platform.requestVideoAccess()).resolves.toBe("denied");
    await expect(platform.pickVideo()).resolves.toBeNull();
  });

  it("supports cancellation as a null result", async () => {
    const platform = createMockMediaPlatform({
      pickVideo: async () => null,
      pickImage: async () => null,
    });

    await expect(platform.pickVideo()).resolves.toBeNull();
    await expect(platform.pickImage()).resolves.toBeNull();
  });
});
