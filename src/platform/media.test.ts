import { beforeEach, describe, expect, it, vi } from "vitest";

const { picker, camera, filesystem } = vi.hoisted(() => ({
  picker: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    pickVideos: vi.fn(),
  },
  camera: {
    getPhoto: vi.fn(),
  },
  filesystem: {
    readFile: vi.fn(),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
}));

vi.mock("@capacitor/camera", () => ({
  Camera: camera,
  CameraResultType: { Uri: "uri" },
  CameraSource: { Photos: "photos" },
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: filesystem,
}));

vi.mock("@capawesome/capacitor-file-picker", () => ({
  FilePicker: picker,
}));

import { mediaPlatform } from "./media";

describe("Capacitor media platform", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    picker.checkPermissions.mockResolvedValue({
      readExternalStorage: "granted",
    });

    picker.requestPermissions.mockResolvedValue({
      readExternalStorage: "granted",
    });
  });

  it("checks and requests video access through the native file picker", async () => {
    await expect(mediaPlatform.requestVideoAccess()).resolves.toBe("granted");
    expect(picker.checkPermissions).toHaveBeenCalledOnce();
    expect(picker.requestPermissions).not.toHaveBeenCalled();
  });

  it("selects and normalizes a native video", async () => {
    picker.pickVideos.mockResolvedValue({
      files: [{
        name: "video.mp4",
        mimeType: "video/mp4",
        size: 2048,
        path: "content://media/video/1",
        duration: 17.5,
        width: 1920,
        height: 1080,
      }],
    });

    const asset = await mediaPlatform.pickVideo();

    expect(asset).toMatchObject({
      name: "video.mp4",
      mimeType: "video/mp4",
      kind: "video",
      size: 2048,
      uri: "content://media/video/1",
      duration: 17.5,
      width: 1920,
      height: 1080,
    });

    expect(picker.pickVideos).toHaveBeenCalledWith({
      limit: 1,
      readData: false,
    });
  });

  it("selects and normalizes a native image through Camera", async () => {
    camera.getPhoto.mockResolvedValue({
      path: "file:///photos/image.jpg",
      webPath: "http://localhost/_capacitor_file_/photos/image.jpg",
      format: "jpeg",
    });

    const asset = await mediaPlatform.pickImage();

    expect(asset).toMatchObject({
      mimeType: "image/jpeg",
      kind: "image",
      uri: "file:///photos/image.jpg",
    });

    expect(camera.getPhoto).toHaveBeenCalledWith({
      source: "photos",
      resultType: "uri",
      allowEditing: false,
      quality: 100,
    });
  });

  it("reads a native file through Filesystem and decodes base64", async () => {
    const payload = btoa("native-media");
    filesystem.readFile.mockResolvedValue({ data: payload });

    const result = await mediaPlatform.readFile("file:///media/video.mp4");

    expect(filesystem.readFile).toHaveBeenCalledWith({
      path: "/media/video.mp4",
    });
    expect(new TextDecoder().decode(result)).toBe("native-media");
  });

  it("returns null when the native picker is cancelled", async () => {
    picker.pickVideos.mockResolvedValue({ files: [] });
    camera.getPhoto.mockRejectedValue(new Error("cancelled"));

    await expect(mediaPlatform.pickVideo()).resolves.toBeNull();
    await expect(mediaPlatform.pickImage()).resolves.toBeNull();
  });

  it("returns denied when native media permission is denied", async () => {
    picker.checkPermissions.mockResolvedValue({
      readExternalStorage: "denied",
    });
    picker.requestPermissions.mockResolvedValue({
      readExternalStorage: "denied",
    });

    await expect(mediaPlatform.requestVideoAccess()).resolves.toBe("denied");
    expect(picker.requestPermissions).toHaveBeenCalledWith({
      permissions: ["readExternalStorage"],
    });
  });
});
