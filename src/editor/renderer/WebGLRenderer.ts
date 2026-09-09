import type { Renderer, TimelineClip } from "../types/andrew-core";

interface DrawableAsset { element?: HTMLImageElement | HTMLVideoElement | HTMLAudioElement; bitmap?: ImageBitmap }

export default class WebGLRenderer implements Renderer {
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private time = 0;
  private clips: readonly TimelineClip[] = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 no está disponible.");
    this.gl = gl;
    this.initialize();
  }

  private initialize(): void {
    const vertex = this.compile(glVertexShader, this.gl.VERTEX_SHADER);
    const fragment = this.compile(glFragmentShader, this.gl.FRAGMENT_SHADER);
    const program = this.gl.createProgram();
    if (!program) throw new Error("No se pudo crear el programa WebGL.");
    this.gl.attachShader(program, vertex); this.gl.attachShader(program, fragment); this.gl.linkProgram(program);
    this.gl.deleteShader(vertex); this.gl.deleteShader(fragment);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) { const message = this.gl.getProgramInfoLog(program) ?? "Error de enlace WebGL."; this.gl.deleteProgram(program); throw new Error(message); }
    this.program = program;
    this.buffer = this.gl.createBuffer();
    this.texture = this.gl.createTexture();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), this.gl.STATIC_DRAW);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  }

  private compile(source: string, type: number): WebGLShader { const shader = this.gl.createShader(type); if (!shader) throw new Error("No se pudo crear shader WebGL."); this.gl.shaderSource(shader, source); this.gl.compileShader(shader); if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) { const message = this.gl.getShaderInfoLog(shader) ?? "Error de compilación WebGL."; this.gl.deleteShader(shader); throw new Error(message); } return shader; }
  resize(width = this.canvas.width, height = this.canvas.height): void { this.canvas.width = Math.max(1, Math.floor(width)); this.canvas.height = Math.max(1, Math.floor(height)); this.gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
  setTime(time: number): void { this.time = Math.max(0, time); for (const clip of this.clips) { const asset = (clip as TimelineClip & { asset?: DrawableAsset }).asset; const element = asset?.element; if (element instanceof HTMLVideoElement && this.time >= clip.start && this.time <= clip.start + clip.duration) { const local = clip.sourceStart + (this.time - clip.start) * clip.speed; if (Math.abs(element.currentTime - local) > 0.02) element.currentTime = local; } } }
  setClips(clips: readonly TimelineClip[]): void { this.clips = clips; }
  render(): void { if (this.disposed || !this.program || !this.buffer || !this.texture) return; const gl = this.gl; gl.viewport(0,0,this.canvas.width,this.canvas.height); gl.clearColor(0.035,0.035,0.045,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer); const position = gl.getAttribLocation(this.program,"a_position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.texture); const visible = this.clips.filter(c => this.time >= c.start && this.time <= c.start + c.duration).sort((a,b) => a.start-b.start); const selected = visible[visible.length-1] as (TimelineClip & { asset?: DrawableAsset }) | undefined; const source = selected?.asset?.element ?? selected?.asset?.bitmap; if (source && selected) { try { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source as TexImageSource); } catch { return; } const sampler=gl.getUniformLocation(this.program,"u_texture"); gl.uniform1i(sampler,0); } gl.drawArrays(gl.TRIANGLE_STRIP,0,4); }
  dispose(): void { if (this.disposed) return; this.disposed=true; if (this.texture) this.gl.deleteTexture(this.texture); if (this.buffer) this.gl.deleteBuffer(this.buffer); if (this.program) this.gl.deleteProgram(this.program); this.texture=null; this.buffer=null; this.program=null; }
}

const glVertexShader = `#version 300 es\nin vec2 a_position;\nout vec2 v_uv;\nvoid main(){v_uv=vec2((a_position.x+1.0)*0.5,1.0-(a_position.y+1.0)*0.5);gl_Position=vec4(a_position,0.0,1.0);}`;
const glFragmentShader = `#version 300 es\nprecision mediump float;\nin vec2 v_uv;\nuniform sampler2D u_texture;\nout vec4 outColor;\nvoid main(){outColor=texture(u_texture,v_uv);}`;
