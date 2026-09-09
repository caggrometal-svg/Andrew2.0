import type { ManagedAsset, Renderer, Seconds, TimelineClip } from "../types/andrew-core";
import { getActivePreviewClips, getMediaTime } from "./preview-model";
import type { TimelineTrack } from "../types/andrew-core";

type GL = WebGL2RenderingContext;

type TextureEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
  source?: HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
};

const VERTEX = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec4 u_rect;
uniform vec2 u_canvas;
uniform float u_rotation;
uniform vec2 u_anchor;
out vec2 v_uv;
void main() {
  vec2 p = a_position * u_rect.zw;
  p -= u_anchor * u_rect.zw;
  float c = cos(u_rotation), s = sin(u_rotation);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  p += u_rect.xy + u_anchor * u_rect.zw;
  vec2 ndc = (p / u_canvas) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
out vec4 outColor;
void main() {
  vec4 c = texture(u_texture, v_uv);
  c.rgb += u_brightness - 1.0;
  c.rgb = (c.rgb - 0.5) * u_contrast + 0.5;
  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  c.rgb = mix(vec3(luma), c.rgb, u_saturation);
  outColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a * u_opacity);
}`;

const QUAD = new Float32Array([
  0, 0, 0, 0,
  1, 0, 1, 0,
  0, 1, 0, 1,
  1, 1, 1, 1,
]);

function compile(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL2: shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(`WebGL2 shader error: ${log}`);
  }
  return shader;
}

function createProgram(gl: GL): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL2: program allocation failed");
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown program error";
    gl.deleteProgram(program);
    throw new Error(`WebGL2 program error: ${log}`);
  }
  return program;
}

function getSource(asset: ManagedAsset): TextureEntry["source"] | undefined {
  if (asset.bitmap) return asset.bitmap;
  if (asset.element instanceof HTMLVideoElement) return asset.element;
  if (asset.element instanceof HTMLImageElement) return asset.element;
  return undefined;
}

function mediaSize(asset: ManagedAsset): [number, number] {
  const element = asset.element;
  if (element instanceof HTMLVideoElement) return [element.videoWidth || 1, element.videoHeight || 1];
  if (element instanceof HTMLImageElement) return [element.naturalWidth || 1, element.naturalHeight || 1];
  if (asset.bitmap) return [asset.bitmap.width, asset.bitmap.height];
  return [asset.width || 1, asset.height || 1];
}

export interface WebGL2PreviewRendererOptions {
  width?: number;
  height?: number;
  dpr?: number;
  maxDpr?: number;
}

export class WebGL2PreviewRenderer implements Renderer {
  private readonly gl: GL;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly textures = new Map<string, TextureEntry>();
  private readonly textCanvases = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
  private readonly locations: {
    position: number;
    uv: number;
    rect: WebGLUniformLocation;
    canvas: WebGLUniformLocation;
    rotation: WebGLUniformLocation;
    anchor: WebGLUniformLocation;
    texture: WebGLUniformLocation;
    opacity: WebGLUniformLocation;
    brightness: WebGLUniformLocation;
    contrast: WebGLUniformLocation;
    saturation: WebGLUniformLocation;
  };
  private clips: readonly TimelineClip[] = [];
  private tracks: readonly TimelineTrack[] = [];
  private assets: Record<string, ManagedAsset> = {};
  private time = 0;
  private playing = false;
  private width: number;
  private height: number;
  private dpr: number;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: WebGL2PreviewRendererOptions = {},
  ) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    this.width = Math.max(1, options.width ?? canvas.clientWidth || 1);
    this.height = Math.max(1, options.height ?? canvas.clientHeight || 1);
    this.dpr = Math.min(options.dpr ?? globalThis.devicePixelRatio ?? 1, options.maxDpr ?? 2);

    this.program = createProgram(gl);
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error("WebGL2: buffer allocation failed");
    this.vao = vao;
    this.buffer = buffer;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "a_position");
    const uv = gl.getAttribLocation(this.program, "a_uv");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    const uniform = (name: string) => {
      const location = gl.getUniformLocation(this.program, name);
      if (!location) throw new Error(`WebGL2: missing uniform ${name}`);
      return location;
    };
    this.locations = {
      position,
      uv,
      rect: uniform("u_rect"),
      canvas: uniform("u_canvas"),
      rotation: uniform("u_rotation"),
      anchor: uniform("u_anchor"),
      texture: uniform("u_texture"),
      opacity: uniform("u_opacity"),
      brightness: uniform("u_brightness"),
      contrast: uniform("u_contrast"),
      saturation: uniform("u_saturation"),
    };

    gl.useProgram(this.program);
    gl.uniform1i(this.locations.texture, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.resize(this.width, this.height);
  }

  setAssets(assets: Record<string, ManagedAsset>): void {
    this.assets = assets;
  }

  setTracks(tracks: readonly TimelineTrack[]): void {
    this.tracks = tracks;
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    for (const asset of Object.values(this.assets)) {
      const video = asset.element instanceof HTMLVideoElement ? asset.element : undefined;
      if (!video) continue;
      if (playing) void video.play().catch(() => undefined);
      else video.pause();
    }
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setTime(time: Seconds): void {
    this.time = Number.isFinite(time) ? Math.max(0, time) : 0;
  }

  setClips(clips: readonly TimelineClip[]): void {
    this.clips = clips;
  }

  render(): void {
    if (this.destroyed) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.locations.canvas, this.width, this.height);

    const active = getActivePreviewClips(this.clips, this.tracks, this.time);
    for (const clip of active) {
      if (clip.type === "media") this.drawMedia(clip);
      else this.drawText(clip);
    }
    gl.bindVertexArray(null);
  }

  deleteAssetTexture(assetId: string): void {
    const entry = this.textures.get(assetId);
    if (entry) {
      this.gl.deleteTexture(entry.texture);
      this.textures.delete(assetId);
    }
    this.textCanvases.delete(assetId);
  }

  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const id of this.textures.keys()) this.deleteAssetTexture(id);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }

  private drawMedia(clip: Extract<TimelineClip, { type: "media" }>): void {
    const asset = this.assets[clip.assetId];
    if (!asset) return;
    const source = getSource(asset);
    if (!source) return;

    const video = asset.element instanceof HTMLVideoElement ? asset.element : undefined;
    if (video) {
      const desired = getMediaTime(clip, this.time);
      if (!this.playing && Math.abs(video.currentTime - desired) > 0.015 && video.readyState >= 1) {
        try { video.currentTime = desired; } catch { /* media may still be loading */ }
      }
      if (video.readyState < 2) return;
    }

    const [sourceWidth, sourceHeight] = mediaSize(asset);
    const texture = this.ensureTexture(clip.assetId, source, sourceWidth, sourceHeight);
    if (!texture) return;
    const targetWidth = clip.transform.scaleX * sourceWidth;
    const targetHeight = clip.transform.scaleY * sourceHeight;
    this.uploadSource(texture, source, video);
    this.draw(texture.texture, clip, clip.transform.x, clip.transform.y, targetWidth, targetHeight);
  }

  private drawText(clip: Extract<TimelineClip, { type: "text" }>): void {
    const canvas = this.getTextCanvas(clip);
    const texture = this.ensureTexture(clip.id, canvas, canvas.width, canvas.height);
    if (!texture) return;
    this.uploadSource(texture, canvas);
    this.draw(texture.texture, clip, clip.transform.x, clip.transform.y, canvas.width * clip.transform.scaleX, canvas.height * clip.transform.scaleY);
  }

  private draw(
    texture: WebGLTexture,
    clip: TimelineClip,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform4f(this.locations.rect, x, y, width, height);
    gl.uniform1f(this.locations.rotation, (clip.transform.rotation * Math.PI) / 180);
    gl.uniform2f(this.locations.anchor, clip.transform.anchorX, clip.transform.anchorY);
    gl.uniform1f(this.locations.opacity, clip.adjustments.opacity);
    gl.uniform1f(this.locations.brightness, clip.adjustments.brightness);
    gl.uniform1f(this.locations.contrast, clip.adjustments.contrast);
    gl.uniform1f(this.locations.saturation, clip.adjustments.saturation);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private ensureTexture(id: string, source: TextureEntry["source"], width: number, height: number): TextureEntry | undefined {
    let entry = this.textures.get(id);
    if (entry) return entry;
    const texture = this.gl.createTexture();
    if (!texture) return undefined;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Math.max(1, width), Math.max(1, height), 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    entry = { texture, width, height, source };
    this.textures.set(id, entry);
    return entry;
  }

  private uploadSource(entry: TextureEntry, source: Exclude<TextureEntry["source"], undefined>, video?: HTMLVideoElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    if (video) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
  }

  private getTextCanvas(clip: Extract<TimelineClip, { type: "text" }>): HTMLCanvasElement | OffscreenCanvas {
    const cached = this.textCanvases.get(clip.id);
    if (cached) return cached;
    const width = Math.max(1, Math.ceil(clip.fontConfig.size * Math.max(1, clip.textContent.length) * 0.75));
    const height = Math.max(1, Math.ceil(clip.fontConfig.size * clip.fontConfig.lineHeight));
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${clip.fontConfig.style} ${clip.fontConfig.weight} ${clip.fontConfig.size}px ${clip.fontConfig.family}`;
    ctx.fillStyle = clip.fontConfig.color;
    ctx.textBaseline = "top";
    ctx.textAlign = clip.fontConfig.align;
    const x = clip.fontConfig.align === "left" ? 0 : clip.fontConfig.align === "center" ? width / 2 : width;
    ctx.fillText(clip.textContent, x, 0, width);
    this.textCanvases.set(clip.id, canvas);
    return canvas;
  }
}

export default WebGL2PreviewRenderer;
