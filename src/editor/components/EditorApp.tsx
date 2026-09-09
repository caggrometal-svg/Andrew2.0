import { useEffect, useRef, useState } from "react";
import WebGLRenderer from "../renderer/WebGLRenderer";
import { assetManager } from "../managers/AssetManager";
import { useTimelineStore } from "../timeline/timeline-store";
import TimelineUI from "./TimelineUI";
import ClipInspector from "./ClipInspector";
import { videoExporter } from "../export/VideoExporter";
import type { TimelineClip, UUID } from "../types/andrew-core";

const dimensions={"9:16":[360,640],"16:9":[640,360],"1:1":[520,520]} as const;
const defaults=(assetId:UUID,trackId:UUID,name:string,duration:number):Omit<TimelineClip,"id">=>({assetId,trackId,kind:"media",name,start:0,duration:Math.max(.1,duration),sourceStart:0,sourceDuration:duration,speed:1,volume:1,transform:{x:0,y:0,scaleX:1,scaleY:1,rotation:0,anchorX:.5,anchorY:.5},appearance:{opacity:1,blendMode:"normal"},effects:{filters:{brightness:1,contrast:1,saturation:1,hue:0,blur:0,grayscale:0,sepia:0,invert:0}}});

export default function EditorApp():JSX.Element{
 const state=useTimelineStore(); const canvasRef=useRef<HTMLCanvasElement>(null); const rendererRef=useRef<WebGLRenderer>(); const inputRef=useRef<HTMLInputElement>(null); const [ratio,setRatio]=useState<keyof typeof dimensions>("16:9"); const [exporting,setExporting]=useState(false); const [progress,setProgress]=useState(0);
 useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const renderer=new WebGLRenderer(canvas);renderer.resize(canvas.clientWidth||dimensions[ratio][0],canvas.clientHeight||dimensions[ratio][1]);rendererRef.current=renderer;return()=>{renderer.dispose();rendererRef.current=undefined};},[]);
 useEffect(()=>{const renderer=rendererRef.current;if(!renderer)return;const clips=state.clips.map(c=>({...c,asset:state.assetsMap[c.assetId]} as TimelineClip & {asset:typeof state.assetsMap[string]}));renderer.setClips(clips);renderer.setTime(state.currentTime);renderer.render();},[state.clips,state.assetsMap,state.currentTime]);
 useEffect(()=>{if(!state.playing)return;let raf=0;let last=performance.now();const tick=(now:number):void=>{const delta=(now-last)/1000;last=now;const next=state.currentTime+delta;if(next>=state.duration){if(state.loop)state.setCurrentTime(0);else state.setPlaying(false)}else state.setCurrentTime(next);raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf)},[state.playing,state.loop,state.duration,state.currentTime,state]);
 const addFiles=async(files:FileList|null):Promise<void>=>{if(!files)return;for(const file of Array.from(files)){const {asset}=await assetManager.load(file);if(asset.type==="audio")continue;const track=state.tracks[0]??{id:state.addTrack(),name:"Pista 1",order:0,muted:false,locked:false,visible:true};const start=state.duration;state.addClip({...defaults(asset.id,track.id,asset.name,asset.duration??5),start});state.setCurrentTime(start)} };
 const addText=():void=>{const track=state.tracks[0];if(!track)return;state.addClip({...defaults("text",track.id,"Texto",5),kind:"text",text:"Nuevo texto"})};
 const exportVideo=async():Promise<void=>{setExporting(true);setProgress(0);try{const result=await videoExporter.export({width:dimensions[ratio][0],height:dimensions[ratio][1],fps:state.fps,filename:"andrew-export.webm"},{onProgress:p=>setProgress(p.percentage),onComplete:r=>videoExporter.download(r)});void result}finally{setExporting(false)}};
 return <main style={app}>
  <header style={header}><strong>ANDREW EDITOR</strong><input style={projectName} defaultValue="Nuevo proyecto"/><div style={spacer}/><button onClick={()=>inputRef.current?.click()}>Importar</button><input ref={inputRef} hidden type="file" multiple accept="image/*,video/*,audio/*" onChange={e=>void addFiles(e.target.files)}/><button onClick={addText}>Texto</button><button disabled={exporting} onClick={()=>void exportVideo()}>{exporting?`Exportando ${Math.round(progress)}%`:"Exportar"}</button></header>
  <div style={body}><aside style={media}><h3>Medios</h3><button style={wide} onClick={()=>inputRef.current?.click()}>+ Añadir medios</button>{Object.values(state.assetsMap).map(asset=><button key={asset.id} style={assetButton} onClick={()=>{const track=state.tracks[0];if(track&&asset.type!=="audio")state.addClip({...defaults(asset.id,track.id,asset.name,asset.duration??5),start:state.duration})}}><span>{asset.type.toUpperCase()}</span><small>{asset.name}</small></button>)}</aside>
   <section style={workspace}><div style={preview}><canvas ref={canvasRef} width={dimensions[ratio][0]} height={dimensions[ratio][1]} style={{maxWidth:"100%",maxHeight:"100%",aspectRatio:`${dimensions[ratio][0]}/${dimensions[ratio][1]`}}/></div><div style={transport}><button onClick={()=>state.togglePlay()}>{state.playing?"Pausa":"Reproducir"}</button><span>{state.currentTime.toFixed(2)} / {state.duration.toFixed(2)} s</span><select value={ratio} onChange={e=>setRatio(e.target.value as keyof typeof dimensions)}><option value="9:16">9:16</option><option value="16:9">16:9</option><option value="1:1">1:1</option></select><label>FPS <input type="number" min="1" max="240" value={state.fps} onChange={e=>state.setFPS(Number(e.target.value))}/></label></div><TimelineUI/></section>
   <ClipInspector/>
  </div>
 </main>;
}
const app:React.CSSProperties={height:"100vh",display:"flex",flexDirection:"column",background:"#090a0d",color:"#eee",fontFamily:"system-ui, sans-serif"};
const header:React.CSSProperties={height:52,display:"flex",alignItems:"center",gap:8,padding:"0 12px",borderBottom:"1px solid #282b33",boxSizing:"border-box"};
const projectName:React.CSSProperties={width:220,background:"#14161c",border:"1px solid #30333d",borderRadius:5,color:"#eee",padding:7};
const spacer:React.CSSProperties={flex:1};
const body:React.CSSProperties={display:"grid",gridTemplateColumns:"220px minmax(0,1fr) 280px",minHeight:0,flex:1};
const media:React.CSSProperties={padding:12,borderRight:"1px solid #282b33",overflow:"auto"};
const wide:React.CSSProperties={width:"100%",padding:9,marginBottom:10};
const assetButton:React.CSSProperties={width:"100%",display:"flex",gap:8,alignItems:"center",padding:8,marginBottom:5,background:"#15171d",border:"1px solid #292c35",borderRadius:5,color:"#eee",textAlign:"left"};
const workspace:React.CSSProperties={display:"flex",flexDirection:"column",minWidth:0,minHeight:0};
const preview:React.CSSProperties={flex:1,minHeight:250,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"#050609"};
const transport:React.CSSProperties={height:48,display:"flex",alignItems:"center",gap:10,padding:"0 10px",borderTop:"1px solid #282b33",borderBottom:"1px solid #282b33"};
