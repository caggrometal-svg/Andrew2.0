import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";
import { FilePicker } from "@capawesome/capacitor-file-picker";

export type MediaPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";
export type MediaKind = "image" | "video" | "audio";

export interface MediaAsset {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  kind: MediaKind;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  source?: Blob;
}

export interface MediaPlatform {
  requestVideoAccess(): Promise<MediaPermissionState>;
  requestImageAccess(): Promise<MediaPermissionState>;
  pickVideo(): Promise<MediaAsset | null>;
  pickImage(): Promise<MediaAsset | null>;
  readFile(uri: string): Promise<ArrayBuffer>;
}

const makeId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const kindFromMime = (mimeType: string): MediaKind => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  return "video";
};

const permissionFrom = (value: string | undefined): MediaPermissionState => {
  if (value === "granted" || value === "denied" || value === "prompt-with-rationale") return value;
  return "prompt";
};

const isNative = (): boolean => Capacitor.isNativePlatform();

const webPick = async (accept: string): Promise<MediaAsset | null> => {
  if (typeof document === "undefined") return null;

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      resolve({
        id: makeId(),
        uri: URL.createObjectURL(file),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        kind: kindFromMime(file.type),
        size: file.size,
        source: file,
      });
    };
    input.click();
  });
};

const pickerAsset = (file: {
  name: string;
  mimeType: string;
  size: number;
  path?: string;
  duration?: number;
  width?: number;
  height?: number;
  blob?: Blob;
}): MediaAsset => ({
  id: makeId(),
  uri: file.path ?? (file.blob ? URL.createObjectURL(file.blob) : ""),
  name: file.name,
  mimeType: file.mimeType || "application/octet-stream",
  kind: kindFromMime(file.mimeType),
  size: file.size,
  duration: file.duration,
  width: file.width,
  height: file.height,
  source: file.blob,
});

export const mediaPlatform: MediaPlatform = {
  async requestVideoAccess(): Promise<MediaPermissionState> {
    if (!isNative()) return "granted";

    try {
      const permissions = await FilePicker.checkPermissions();
      if (permissionFrom(permissions.readExternalStorage) === "granted") return "granted";
      const requested = await FilePicker.requestPermissions({ permissions: ["readExternalStorage"] });
      return permissionFrom(requested.readExternalStorage);
    } catch {
      return "prompt";
    }
  },

  async requestImageAccess(): Promise<MediaPermissionState> {
    if (!isNative()) return "granted";

    try {
      const permissions = await FilePicker.checkPermissions();
      if (permissionFrom(permissions.readExternalStorage) === "granted") return "granted";
      const requested = await FilePicker.requestPermissions({ permissions: ["readExternalStorage"] });
      return permissionFrom(requested.readExternalStorage);
    } catch {
      return "prompt";
    }
  },

  async pickVideo(): Promise<MediaAsset | null> {
    if (!isNative()) return webPick("video/*");

    try {
      const result = await FilePicker.pickVideos({ limit: 1, readData: false });
      const file = result.files[0];
      return file ? pickerAsset(file) : null;
    } catch {
      return null;
    }
  },

  async pickImage(): Promise<MediaAsset | null> {
    if (!isNative()) return webPick("image/*");

    try {
      const result = await Camera.getPhoto({
        source: CameraSource.Photos,
        resultType: CameraResultType.Uri,
        allowEditing: false,
        quality: 100,
      });

      if (!result.webPath && !result.path) return null;

      return {
        id: makeId(),
        uri: result.path ?? result.webPath ?? "",
        name: `image-${Date.now()}.${result.format || "jpg"}`,
        mimeType: `image/${result.format || "jpeg"}`,
        kind: "image",
      };
    } catch {
      return null;
    }
  },

  async readFile(uri: string): Promise<ArrayBuffer> {
    if (!uri) throw new Error("Media URI is required");

    if (!isNative() || /^https?:\/\//i.test(uri)) {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`Unable to read media: ${response.status}`);
      return response.arrayBuffer();
    }

    const path = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
    const result = await Filesystem.readFile({ path });

    if (typeof result.data !== "string") {
      throw new Error("Native Filesystem returned an unsupported media payload");
    }

    const binary = atob(result.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  },
};

export default mediaPlatform;
