export type MediaKind = 'image' | 'video' | 'audio';

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  size?: number;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  start: number;
  duration: number;
  sourceStart: number;
  volume: number;
  speed: number;
}

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  bold: boolean;
}

export interface EditorProject {
  id: string;
  name: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  assets: MediaAsset[];
  clips: TimelineClip[];
  textLayers: TextLayer[];
  currentTime: number;
  selectedClipId?: string;
  updatedAt: string;
}
