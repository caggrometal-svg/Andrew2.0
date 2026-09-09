import { useEffect, useRef, useState, type CSSProperties } from "react";
import WebGLRenderer from "../renderer/WebGLRenderer";
import { assetManager } from "../managers/AssetManager";
import { useTimelineStore } from "../timeline/timeline-store";
import TimelineUI from "./TimelineUI";
import ClipInspector from "./ClipInspector";
import { videoExporter } from "../export/VideoExporter";
import type { MediaClip, TextClip } from "../types/andrew-core";

const dimensions = { "9:16": [360, 640], "16:9": [640, 360], "1:1": [520, 520] } as const;
const transform = () => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 });
const adjustments = () => ({ opacity: 1, brightness: 1, contrast: 1, saturation: 1 });
const mediaClip = (assetId: string, trackId: string, startTime: number, duration: number, zIndex: number): Omit<MediaClip, "id"> => ({ type: "media", assetId, trackId, startTime, duration: Math.max(0.1, duration), trimStart: 0, trimEnd: 0, transform: transform(), adjustments: adjustments(), zIndex });

export default function EditorApp(): JSX.Element {
  const state = useTimelineStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ratio, setRatio] = useState<keyof typeof dimensions>("16:9");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const renderer = new WebGLRenderer(canvas); renderer.resize(dimensions[ratio][0], dimensions[ratio][1]); rendererRef.current = renderer;
    const unregister = assetManager.registerRenderer(renderer);
    return () => { unregister(); renderer.dispose(); rendererRef.current = null; };
  }, [ratio]);

  useEffect(() => {
    const renderer = rendererRef.current; if (!renderer) return;
    renderer.setClips(state.clips); renderer.setTime(state.currentTime); renderer.render();
  }, [state.clips, state.currentTime]);

  useEffect(() => {
    if (!state.playing) return;
    let raf = 0; let last = performance.now();
    const tick = (now: number): void => {
      const store = useTimelineStore.getState(); const delta = Math.max(0, (now - last) / 1000); last = now; const next = store.currentTime + delta;
      if (next >= store.duration) { if (store.loop) store.setCurrentTime(0); else store.setPlaying(false); } else store.setCurrentTime(next);
      if (useTimelineStore.getState().playing) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [state.playing, state.loop]);

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const { asset } = await assetManager.load(file); if (asset.type === "audio") continue;
      const store = useTimelineStore.getState(); const track = store.tracks[0] ?? { id: store.addTrack(), name: "Pista 1", order: 0, muted: false, locked: false, visible: true }; const startTime = store.duration;
      store.addClip(mediaClip(asset.id, track.id, startTime, asset.duration ?? 5, store.clips.length));
      store.setCurrentTime(startTime);
    }
  };

  const addText = (): void => {
    const store = useTimelineStore.getState(); const track = store.tracks[0] ?? { id: store.addTrack(), name: "Pista 1", order: 0, muted: false, locked: false, visible: true };
    const clip: Omit<TextClip, "id"> = { type: "text", trackId: track.id, textContent: "Nuevo texto", fontConfig: { family: "Arial", size: 48, weight: 700, style: "normal", color: "#ffffff", align: "center", lineHeight: 1.2 }, startTime: store.currentTime, duration: 5, transform: transform(), adjustments: adjustments(), zIndex: store.clips.length };
    store.addClip(clip);
  };

  const exportVideo = async (): Promise<void> => {
    setExporting(true); setProgress(0);
    try { await videoExporter.export({ width: dimensions[ratio][0], height: dimensions[ratio][1], fps: state.fps }, { onProgress: (p) => setProgress(p.percentage), onComplete: (result) => videoExporter.download(result) }); }
    finally { setExporting(false); }
  };

  return <main style={app}>
    <header style={header}><strong>ANDREW EDITOR</strong><input style={projectName} defaultValue="Nuevo proyecto"/><div style={spacer}/><button onClick={() => inputRef.current?.click()}>Importar</button><input ref={inputRef} hidden type="file" multiple accept="image/*,video/*,audio/*" onChange={(e) => void addFiles(e.target.files)}/><button onClick={addText}>Texto</button><button disabled={exporting} onClick={() => void exportVideo()}>{exporting ? `Exportando ${Math.round(progress)}%` : "Exportar"}</button></header>
    <div style={body}><aside style={media}><h3>Medios</h3><button style={wide} onClick={() => inputRef.current?.click()}>+ Añadir medios</button>{Object.values(state.assetsMap).map((asset) => <button key={asset.id} style={assetButton} onClick={() => { const store = useTimelineStore.getState(); const track = store.tracks[0]; if (track && asset.type !== "audio") store.addClip(mediaClip(asset.id, track.id, store.duration, asset.duration ?? 5, store.clips.length)); }}><span>{asset.type.toUpperCase()}</span><small>{asset.name}</small></button>)}</aside>
      <section style={workspace}><div style={preview}><canvas ref={canvasRef} width={dimensions[ratio][0]} height={dimensions[ratio][1]} style={{ maxWidth: "100%", maxHeight: "100%", aspectRatio: `${dimensions[ratio][0]}/${dimensions[ratio][1]}` }}/></div><div style={transport}><button onClick={() => state.togglePlay()}>{state.playing ? "Pausa" : "Reproducir"}</button><span>{state.currentTime.toFixed(2)} / {state.duration.toFixed(2)} s</span><select value={ratio} onChange={(e) => setRatio(e.target.value as keyof typeof dimensions)}><option value="9:16">9:16</option><option value="16:9">16:9</option><option value="1:1">1:1</option></select><label>FPS <input type="number" min="1" max="240" value={state.fps} onChange={(e) => state.setFPS(Number(e.target.value))}/></label></div><TimelineUI/></section>
      <ClipInspector />
    </div>
  </main>;
}

const app: CSSProperties = { height: "100vh", display: "flex", flexDirection: "column", background: "#090a0d", color: "#eee", fontFamily: "system-ui, sans-serif" };
const header: CSSProperties = { height: 52, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: "1px solid #282b33", boxSizing: "border-box" };
const projectName: CSSProperties = { width: 220, background: "#14161c", border: "1px solid #30333d", borderRadius: 5, color: "#eee", padding: 7 };
const spacer: CSSProperties = { flex: 1 };
const body: CSSProperties = { display: "grid", gridTemplateColumns: "220px minmax(0,1fr) 280px", minHeight: 0, flex: 1 };
const media: CSSProperties = { padding: 12, borderRight: "1px solid #282b33", overflow: "auto" };
const wide: CSSProperties = { width: "100%", padding: 9, marginBottom: 10 };
const assetButton: CSSProperties = { width: "100%", display: "flex", gap: 8, alignItems: "center", padding: 8, marginBottom: 5, background: "#15171d", border: "1px solid #292c35", borderRadius: 5, color: "#eee", textAlign: "left" };
const workspace: CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 };
const preview: CSSProperties = { flex: 1, minHeight: 250, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#050609" };
const transport: CSSProperties = { height: 48, display: "flex", alignItems: "center", gap: 10, padding: "0 10px", borderTop: "1px solid #282b33", borderBottom: "1px solid #282b33" };
