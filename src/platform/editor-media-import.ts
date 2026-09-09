import mediaPlatform, { type MediaAsset as PlatformMediaAsset, type MediaKind } from "./media";
import {
  importMediaAssetToTimeline,
  type MediaAsset as TimelineMediaAsset,
  type BindMediaOptions,
} from "../editor/timeline/media-timeline-binding";

export type EditorImportKind = Extract<MediaKind, "image" | "video">;

export interface EditorMediaImportOptions extends BindMediaOptions {
  platform?: Pick<typeof mediaPlatform, "pickVideo" | "pickImage" | "readFile">;
}

const extensionFromMime = (mimeType: string): string => {
  const subtype = mimeType.split("/")[1]?.split(";")[0]?.trim().toLowerCase();
  return subtype ? `.${subtype}` : "";
};

const fileName = (asset: PlatformMediaAsset): string => {
  if (asset.name) return asset.name;
  return `media-${asset.id}${extensionFromMime(asset.mimeType)}`;
};

const toTimelineMediaAsset = async (
  asset: PlatformMediaAsset,
  platform: Pick<typeof mediaPlatform, "readFile">,
): Promise<TimelineMediaAsset> => {
  const source = asset.source ?? new Blob([await platform.readFile(asset.uri)], {
    type: asset.mimeType,
  });

  return {
    id: asset.id,
    uri: asset.uri,
    name: fileName(asset),
    mimeType: asset.mimeType,
    kind: asset.kind,
    size: asset.size ?? source.size,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    source,
  };
};

export const importPlatformMediaAssetToTimeline = async (
  asset: PlatformMediaAsset | null,
  options: EditorMediaImportOptions = {},
): Promise<string | null> => {
  if (!asset || (asset.kind !== "image" && asset.kind !== "video")) return null;

  const platform = options.platform ?? mediaPlatform;
  const timelineAsset = await toTimelineMediaAsset(asset, platform);
  return importMediaAssetToTimeline(timelineAsset, options);
};

export const pickAndImportEditorMedia = async (
  kind: EditorImportKind,
  options: EditorMediaImportOptions = {},
): Promise<string | null> => {
  const platform = options.platform ?? mediaPlatform;
  const asset = kind === "video"
    ? await platform.pickVideo()
    : await platform.pickImage();

  return importPlatformMediaAssetToTimeline(asset, options);
};

export const createEditorMediaImporter = (
  platform: Pick<typeof mediaPlatform, "pickVideo" | "pickImage" | "readFile">,
) => ({
  pickAndImport: (kind: EditorImportKind, options: Omit<EditorMediaImportOptions, "platform"> = {}) =>
    pickAndImportEditorMedia(kind, { ...options, platform }),
});
