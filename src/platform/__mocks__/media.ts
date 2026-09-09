import type { MediaAsset, MediaPlatform, MediaPermissionState } from "../media";

const asset = (kind: "image" | "video", name: string): MediaAsset => ({
  id: `mock-${kind}-1`,
  uri: `mock://${name}`,
  name,
  mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
  kind,
  size: 1024,
  duration: kind === "video" ? 12 : undefined,
  width: 1920,
  height: 1080,
  source: new Blob([kind], { type: kind === "video" ? "video/mp4" : "image/jpeg" }),
});

export const createMockMediaPlatform = (
  overrides: Partial<MediaPlatform> = {},
): MediaPlatform => ({
  requestVideoAccess: async (): Promise<MediaPermissionState> => "granted",
  requestImageAccess: async (): Promise<MediaPermissionState> => "granted",
  pickVideo: async (): Promise<MediaAsset | null> => asset("video", "mock-video.mp4"),
  pickImage: async (): Promise<MediaAsset | null> => asset("image", "mock-image.jpg"),
  readFile: async (): Promise<ArrayBuffer> => new TextEncoder().encode("mock-media").buffer,
  ...overrides,
});

export const mockMediaPlatform = createMockMediaPlatform();

export default mockMediaPlatform;
