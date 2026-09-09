import type { ManagedAsset, Renderer, Seconds, TimelineClip } from "../types/andrew-core";
import type { TimelineTrack } from "../types/andrew-core";
import { getActivePreviewClips, getMediaTime } from "./preview-model";

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;
type TextureEntry = { texture: WebGLTexture; width: number; height: number };

const VS = `#version 300 es
in vec2 a_position; in vec2 a_uv;
uniform vec4 u_rect; uniform vec2 u_canvas; uniform float u_rotation; uniform vec2 u_anchor;
out vec2 v_uv;
void main(){ vec2 p=a_position*u_rect.zw-u_anchor*u_rect.zw; float c=cos(u_rotation),s=sin(u_rotation); p=vec2(p.x*c-p.y*s,p.x*s+p.y*c)+u_rect.xy+u_anchor*u_rect.zw; vec2 n=p/u_canvas*2.0-1.0; gl_Position=vec4(n.x,-n.y,0.0,1.0); v_uv=a_uv; }`;
const FS = `#version 300 es
precision mediump float; in vec2 v_uv; uniform sampler2D u_texture; uniform float u_opacity,u_brightness,u_contrast,u_saturation; out vec4 outColor;
void main(){ vec4 c=texture(u_texture,v_uv); c.rgb+=(u_brightness-1.0); c.rgb=(c.rgb-0.5)*u_contrast+0.5; float l=dot(c.rgb,vec3(0.2126,0.7152,0.0722)); c.rgb=mix(vec3(l),c.rgb,u_saturation); outColor=vec4(clamp(c.rgb,0.0,1.0),c.a*u_opacity); }`;
const QUAD = new Float32Array([0,0,0,0,1,0,1,0,0,1,0,1,1,1,1,1]);

function shader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const s=gl.createShader(type); if(!s) throw new Error("WebGL2 shader allocation failed"); gl.shaderSource(s,source); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s)||"unknown";gl.deleteShader(s);throw new Error(`WebGL2 shader error: ${log}`);} return s;
}
function program(gl: WebGL2RenderingContext): WebGLProgram {
  const p=gl.createProgram(); if(!p) throw new Error("WebGL2 program allocation failed"); const v=shader(gl,gl.VERTEX_SHADER,VS),f=shader(gl,gl.FRAGMENT_SHADER,FS);
  gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const log=gl.getProgramInfoLog(p)||"unknown";gl.deleteProgram(p);throw new Error(`WebGL2 program error: ${log}`);} return p;
}
function sourceOf(asset: ManagedAsset): Source|undefined { const e=asset.element; if(asset.bitmap)return asset.bitmap; if(e instanceof HTMLVideoElement||e instanceof HTMLImageElement)return e; return undefined; }
function sizeOf(asset: ManagedAsset): [number,number] { const e=asset.element; if(e instanceof HTMLVideoElement)return [e.videoWidth||1,e.videoHeight||1]; if(e instanceof HTMLImageElement)return [e.naturalWidth||1,e.naturalHeight||1]; if(asset.bitmap)return [asset.bitmap.width,asset.bitmap.height]; return [asset.width||1,asset.height||1]; }

export interface WebGL2PreviewRendererOptions { width?:number;height?:number;dpr?:number;maxDpr?:number; }

export class WebGL2PreviewRenderer implements Renderer {
  private readonly gl: WebGL2RenderingContext; private readonly p: WebGLProgram; private readonly vao: WebGLVertexArrayObject; private readonly buffer: WebGLBuffer;
  private readonly textures=new Map<string,TextureEntry>(); private readonly text=new Map<string,HTMLCanvasElement|OffscreenCanvas>();
  private readonly u:{rect:WebGLUniformLocation;canvas:WebGLUniformLocation;rotation:WebGLUniformLocation;anchor:WebGLUniformLocation;texture:WebGLUniformLocation;opacity:WebGLUniformLocation;brightness:WebGLUniformLocation;contrast:WebGLUniformLocation;saturation:WebGLUniformLocation};
  private clips:readonly TimelineClip[]=[]; private tracks:readonly TimelineTrack[]=[]; private assets:Record<string,ManagedAsset>={}; private time=0; private playing=false; private destroyed=false; private width:number;private height:number;private dpr:number;

  constructor(private readonly canvas:HTMLCanvasElement, options:WebGL2PreviewRendererOptions={}) {
    const gl=canvas.getContext("webgl2",{alpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:"high-performance"}); if(!gl)throw new Error("WebGL2 is not available"); this.gl=gl;
    this.width=Math.max(1,options.width ?? (canvas.clientWidth||1)); this.height=Math.max(1,options.height ?? (canvas.clientHeight||1)); this.dpr=Math.min(options.dpr ?? globalThis.devicePixelRatio ?? 1,options.maxDpr ?? 2);
    this.p=program(gl); const vao=gl.createVertexArray(),buffer=gl.createBuffer(); if(!vao||!buffer)throw new Error("WebGL2 buffer allocation failed"); this.vao=vao;this.buffer=buffer;
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,QUAD,gl.STATIC_DRAW); const pos=gl.getAttribLocation(this.p,"a_position"),uv=gl.getAttribLocation(this.p,"a_uv");
    gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);gl.bindVertexArray(null);
    const get=(n:string)=>{const x=gl.getUniformLocation(this.p,n);if(!x)throw new Error(`WebGL2 uniform missing: ${n}`);return x;}; this.u={rect:get("u_rect"),canvas:get("u_canvas"),rotation:get("u_rotation"),anchor:get("u_anchor"),texture:get("u_texture"),opacity:get("u_opacity"),brightness:get("u_brightness"),contrast:get("u_contrast"),saturation:get("u_saturation")};
    gl.useProgram(this.p);gl.uniform1i(this.u.texture,0);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);this.resize(this.width,this.height);
  }
  setAssets(assets:Record<string,ManagedAsset>):void{this.assets=assets;}
  setTracks(tracks:readonly TimelineTrack[]):void{this.tracks=tracks;}
  setPlaying(playing:boolean):void{if(this.playing===playing)return;this.playing=playing;for(const a of Object.values(this.assets)){const v=a.element instanceof HTMLVideoElement?a.element:undefined;if(!v)continue;if(playing)void v.play().catch(()=>undefined);else v.pause();}}
  resize(width:number,height:number):void{this.width=Math.max(1,width);this.height=Math.max(1,height);this.canvas.width=Math.max(1,Math.round(this.width*this.dpr));this.canvas.height=Math.max(1,Math.round(this.height*this.dpr));this.gl.viewport(0,0,this.canvas.width,this.canvas.height);}
  setTime(time:Seconds):void{this.time=Number.isFinite(time)?Math.max(0,time):0;}
  setClips(clips:readonly TimelineClip[]):void{this.clips=clips;}
  render():void{if(this.destroyed)return;const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.p);gl.bindVertexArray(this.vao);gl.uniform2f(this.u.canvas,this.width,this.height);for(const clip of getActivePreviewClips(this.clips,this.tracks,this.time)){if(clip.type==="media")this.drawMedia(clip);else this.drawText(clip);}gl.bindVertexArray(null);}
  deleteAssetTexture(id:string):void{const e=this.textures.get(id);if(e){this.gl.deleteTexture(e.texture);this.textures.delete(id);}this.text.delete(id);}
  dispose():void{if(this.destroyed)return;this.destroyed=true;for(const id of [...this.textures.keys()])this.deleteAssetTexture(id);this.gl.deleteBuffer(this.buffer);this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.p);}

  private drawMedia(clip:Extract<TimelineClip,{type:"media"}>):void{const asset=this.assets[clip.assetId],source=asset&&sourceOf(asset);if(!source)return;const video=asset.element instanceof HTMLVideoElement?asset.element:undefined;if(video){const desired=getMediaTime(clip,this.time);if(!this.playing&&video.readyState>=1&&Math.abs(video.currentTime-desired)>0.015){try{video.currentTime=desired;}catch{}}if(video.readyState<2)return;}const [w,h]=sizeOf(asset),entry=this.texture(clip.assetId,source,w,h);if(!entry)return;this.upload(entry,source);this.draw(entry.texture,clip,clip.transform.x,clip.transform.y,w*clip.transform.scaleX,h*clip.transform.scaleY);}
  private drawText(clip:Extract<TimelineClip,{type:"text"}>):void{const c=this.textCanvas(clip),entry=this.texture(clip.id,c,c.width,c.height);if(!entry)return;this.upload(entry,c);this.draw(entry.texture,clip,clip.transform.x,clip.transform.y,c.width*clip.transform.scaleX,c.height*clip.transform.scaleY);}
  private draw(tex:WebGLTexture,clip:TimelineClip,x:number,y:number,w:number,h:number):void{const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform4f(this.u.rect,x,y,w,h);gl.uniform1f(this.u.rotation,clip.transform.rotation*Math.PI/180);gl.uniform2f(this.u.anchor,clip.transform.anchorX,clip.transform.anchorY);gl.uniform1f(this.u.opacity,clip.adjustments.opacity);gl.uniform1f(this.u.brightness,clip.adjustments.brightness);gl.uniform1f(this.u.contrast,clip.adjustments.contrast);gl.uniform1f(this.u.saturation,clip.adjustments.saturation);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
  private texture(id:string,source:Source,w:number,h:number):TextureEntry|undefined{let e=this.textures.get(id);if(e)return e;const gl=this.gl,t=gl.createTexture();if(!t)return undefined;gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,Math.max(1,w),Math.max(1,h),0,gl.RGBA,gl.UNSIGNED_BYTE,null);e={texture:t,width:w,height:h};this.textures.set(id,e);return e;}
  private upload(e:TextureEntry,source:Source):void{const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,e.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);}
  private textCanvas(clip:Extract<TimelineClip,{type:"text"}>):HTMLCanvasElement|OffscreenCanvas{const cached=this.text.get(clip.id);if(cached)return cached;const w=Math.max(1,Math.ceil(clip.fontConfig.size*Math.max(1,clip.textContent.length)*0.75)),h=Math.max(1,Math.ceil(clip.fontConfig.size*clip.fontConfig.lineHeight));const c=typeof OffscreenCanvas!=="undefined"?new OffscreenCanvas(w,h):document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d");if(ctx){ctx.clearRect(0,0,w,h);ctx.font=`${clip.fontConfig.style} ${clip.fontConfig.weight} ${clip.fontConfig.size}px ${clip.fontConfig.family}`;ctx.fillStyle=clip.fontConfig.color;ctx.textBaseline="top";ctx.textAlign=clip.fontConfig.align;ctx.fillText(clip.textContent,clip.fontConfig.align==="left"?0:clip.fontConfig.align==="center"?w/2:w,0,w);}this.text.set(clip.id,c);return c;}
}
export default WebGL2PreviewRenderer;
