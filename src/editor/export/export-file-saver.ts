import { Filesystem, Directory } from "@capacitor/filesystem";
import type { VideoExportResult } from "../types/andrew-core";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function saveExportedVideo(result: VideoExportResult): Promise<string | undefined> {
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const base64 = bytesToBase64(bytes);

  if (typeof window !== "undefined" && "Capacitor" in window) {
    const saved = await Filesystem.writeFile({
      path: result.filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    return saved.uri;
  }

  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return undefined;
}
