import type { ManagedAsset, Renderer, TextClip, TimelineClip, UUID } from "../types/andrew-core";
import { useTimelineStore } from "../timeline/timeline-store";

export default class WebGLRenderer implements Renderer {
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly assetTextures = new Map<UUID, WebGLTexture>();
  private readonly textTextures = new Map<UUID, { key: string; texture: WebGLTexture }>();
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private time = 0;
  private clips: readonly TimelineClip[] = [];
  private disposed = false;
  private positionLocation = -1;
  private textureLocation: WebGLUniformLocation | null = null;
  private transformLocation: WebGLUniformLocation | null = null;
  private opacityLocation: WebGLUniformLocation | null = null;
  private brightnessLocation: WebGLUniformLocation | null = null;
  private contrastLocation: WebGLUniformLocation | null = null;
  private saturationLocation: WebGLUniformLocation | null = null;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 no está disponible.");
    this.gl = gl;
    this.program = this.createProgram();
    const buffer = gl.createBuffer(); if (!buffer) throw new Error("No se pudo crear el buffer WebGL."); this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.positionLocation = gl.getAttribLocation(this.program, "a_position");
    this.textureLocation = gl.getUniformLocation(this.program, "u_texture");
    this.transformLocation = gl.getUniformLocation(this.program, "u_transform");
    this.opacityLocation = gl.getUniformLocation(this.program, "u_opacity");
    this.brightnessLocation = gl.getUniformLocation(this.program, "u_brightness");
    this.contrastLocation = gl.getUniformLocation(this.program, "u_contrast");
    this.saturationLocation = gl.getUniformLocation(this.program, "u_saturation");
  }

  private compile(source: string, type: number): WebGLShader { const shader = this.gl.createShader(type); if (!shader) throw new Error("No se pudo crear shader WebGL."); this.gl.shaderSource(shader, source); this.gl.compileShader(shader); if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) { const message = this.gl.getShaderInfoLog(shader) ?? "Error de shader."; this.gl.deleteShader(shader); throw new Error(message); } return shader; }
  private createProgram(): WebGLProgram { const gl = this.gl; const program = gl.createProgram(); if (!program) throw new Error("No se pudo crear el programa WebGL."); const vertex = this.compile(vertexShader, gl.VERTEX_SHADER); const fragment = this.compile(fragmentShader, gl.FRAGMENT_SHADER); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { const message = gl.getProgramInfoLog(program) ?? "Error de enlace WebGL."; gl.deleteProgram(program); throw new Error(message); } return program; }

  resize(width: number, height: number): void { this.canvas.width = Math.max(1, Math.floor(width)); this.canvas.height = Math.max(1, Math.floor(height)); this.gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
  setTime(time: number): void {
    this.time = Math.max(0, time);
    const assets = useTimelineStore.getState().assetsMap;
    for (const clip of this.clips) if (clip.type === "media" && this.time >= clip.startTime && this.time < clip.startTime + clip.duration) { const asset = assets[clip.assetId]; const video = asset?.element; if (video instanceof HTMLVideoElement && video.readyState >= 2) { const local = clip.trimStart + (this.time - clip.startTime); const target = Math.min(Math.max(0, local), Math.max(0, video.duration - 0.001)); if (Math.abs(video.currentTime - target) > 0.02) video.currentTime = target; } }
  }
  setClips(clips: readonly TimelineClip[]): void { this.clips = clips; }

  private textureForAsset(asset: ManagedAsset): WebGLTexture | null {
    const cached = this.assetTextures.get(asset.id); if (cached) return cached;
    const texture = this.gl.createTexture(); if (!texture) return null; const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); this.assetTextures.set(asset.id, texture); return texture;
  }

  private textTexture(clip: TextClip): WebGLTexture | null {
    const f = clip.fontConfig; const key = JSON.stringify([clip.textContent, f]); const cached = this.textTextures.get(clip.id); if (cached?.key === key) return cached.texture;
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d"); if (!ctx) return null;
    const font = `${f.style} ${typeof f.weight === "number" ? f.weight : f.weight} ${Math.max(1, f.size)}px ${f.family}`; ctx.font = font; const lines = clip.textContent.split("\n"); const width = Math.max(1, Math.ceil(Math.max(...lines.map((line) => ctx.measureText(line).width)) + f.size * 0.5)); const height = Math.max(1, Math.ceil(lines.length * f.size * f.lineHeight)); canvas.width = width; canvas.height = height; ctx.font = font; ctx.fillStyle = f.color; ctx.textBaseline = "top"; ctx.textAlign = f.align; const x = f.align === "left" ? 0 : f.align === "center" ? width / 2 : width; lines.forEach((line, i) => ctx.fillText(line, x, i * f.size * f.lineHeight));
    const gl = this.gl; const old = cached?.texture; if (old) gl.deleteTexture(old); const texture = gl.createTexture(); if (!texture) return null; gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); this.textTextures.set(clip.id, { key, texture }); return texture;
  }

  render(): void {
    if (this.disposed) return; const gl = this.gl; const assets = useTimelineStore.getState().assetsMap; gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(0.035, 0.035, 0.045, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.enableVertexAttribArray(this.positionLocation); gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0); gl.activeTexture(gl.TEXTURE0); if (this.textureLocation) gl.uniform1i(this.textureLocation, 0);
    const visible = this.clips.filter((c) => this.time >= c.startTime && this.time < c.startTime + c.duration).sort((a, b) => a.zIndex - b.zIndex);
    for (const clip of visible) {
      const texture = clip.type === "media" ? this.textureForAsset(assets[clip.assetId]) : this.textTexture(clip); if (!texture) continue;
      if (clip.type === "media") { const asset = assets[clip.assetId]; const source = asset?.element ?? asset?.bitmap; if (!source) continue; try { gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource); } catch { continue; } }
      else gl.bindTexture(gl.TEXTURE_2D, texture);
      const t = clip.transform; const sx = t.scaleX; const sy = t.scaleY; const cos = Math.cos(t.rotation * Math.PI / 180); const sin = Math.sin(t.rotation * Math.PI / 180); gl.uniformMatrix3fv(this.transformLocation, false, new Float32Array([sx * cos, sy * -sin, 0, sx * sin, sy * cos, 0, t.x, t.y, 1])); gl.uniform1f(this.opacityLocation, clip.adjustments.opacity); gl.uniform1f(this.brightnessLocation, clip.adjustments.brightness); gl.uniform1f(this.contrastLocation, clip.adjustments.contrast); gl.uniform1f(this.saturationLocation, clip.adjustments.saturation); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  deleteAssetTexture(assetId: UUID): void { const texture = this.assetTextures.get(assetId); if (texture) { this.gl.deleteTexture(texture); this.assetTextures.delete(assetId); } }
  dispose(): void { if (this.disposed) return; this.disposed = true; for (const texture of this.assetTextures.values()) this.gl.deleteTexture(texture); for (const { texture } of this.textTextures.values()) this.gl.deleteTexture(texture); this.assetTextures.clear(); this.textTextures.clear(); this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program); }
}

const vertexShader = `#version 300 es\nin vec2 a_position;\nuniform mat3 u_transform;\nout vec2 v_uv;\nvoid main(){vec3 p=u_transform*vec3(a_position,1.0);v_uv=vec2((a_position.x+1.0)*0.5,1.0-(a_position.y+1.0)*0.5);gl_Position=vec4(p.xy,0.0,1.0);}`;
const fragmentShader = `#version 300 es\nprecision mediump float;\nin vec2 v_uv;\nuniform sampler2D u_texture;\nuniform float u_opacity;\nuniform float u_brightness;\nuniform float u_contrast;\nuniform float u_saturation;\nout vec4 outColor;\nvoid main(){vec4 c=texture(u_texture,v_uv);vec3 rgb=c.rgb*u_brightness;rgb=(rgb-0.5)*u_contrast+0.5;float l=dot(rgb,vec3(0.2126,0.7152,0.0722));rgb=mix(vec3(l),rgb,u_saturation);outColor=vec4(clamp(rgb,0.0,1.0),c.a*u_opacity);}`;
