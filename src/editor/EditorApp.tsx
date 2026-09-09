import { useEffect, useMemo, useRef, useState } from 'react';
import { createEditorProject, listEditorProjects, saveEditorProject } from './editor-storage';
import { getMediaFile, putMediaFile } from './editor-media-store';
import type { EditorProject, MediaAsset } from './types';

const ratioSize = { '9:16': [360, 640], '16:9': [640, 360], '1:1': [520, 520] } as const;

export default function EditorApp() {
  const [project, setProject] = useState<EditorProject>(() => listEditorProjects()[0] ?? createEditorProject('Nuevo proyecto'));
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [width, height] = ratioSize[project.aspectRatio];

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const hydrated: MediaAsset[] = [];
      for (const asset of project.assets) {
        const blob = await getMediaFile(asset.id);
        if (blob) hydrated.push({ ...asset, url: URL.createObjectURL(blob) });
        else if (asset.url.startsWith('blob:')) hydrated.push(asset);
      }
      if (!cancelled && hydrated.length !== project.assets.length) {
        setProject(p => ({ ...p, assets: hydrated, updatedAt: new Date().toISOString() }));
      } else if (!cancelled) {
        setReady(true);
      }
    }
    hydrate().catch(() => setReady(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (ready) saveEditorProject(project);
  }, [project, ready]);

  useEffect(() => () => {
    project.assets.forEach(asset => asset.url.startsWith('blob:') && URL.revokeObjectURL(asset.url));
  }, [project.assets]);

  const selected = useMemo(() => project.clips.find(c => c.id === project.selectedClipId), [project]);
  const selectedAsset = selected ? project.assets.find(a => a.id === selected.assetId) : undefined;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const assets: MediaAsset[] = [];
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      await putMediaFile(id, file);
      assets.push({
        id,
        name: file.name,
        kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio',
        url: URL.createObjectURL(file),
        mimeType: file.type,
        size: file.size,
      });
    }
    setProject(p => ({ ...p, assets: [...p.assets, ...assets], updatedAt: new Date().toISOString() }));
    setReady(true);
  }

  function addToTimeline(asset: MediaAsset) {
    if (asset.kind === 'audio') return;
    const duration = asset.duration ?? 5;
    const start = project.clips.reduce((sum, clip) => sum + clip.duration, 0);
    const clipId = crypto.randomUUID();
    setProject(p => ({
      ...p,
      clips: [...p.clips, { id: clipId, assetId: asset.id, start, duration, sourceStart: 0, volume: 1, speed: 1 }],
      selectedClipId: clipId,
      updatedAt: new Date().toISOString(),
    }));
    setPlaying(false);
  }

  function updateSelected(patch: Partial<NonNullable<typeof selected>>) {
    if (!selected) return;
    setProject(p => ({ ...p, clips: p.clips.map(c => c.id === selected.id ? { ...c, ...patch } : c), updatedAt: new Date().toISOString() }));
  }

  function removeSelected() {
    if (!selected) return;
    setPlaying(false);
    setProject(p => ({ ...p, clips: p.clips.filter(c => c.id !== selected.id), selectedClipId: undefined, updatedAt: new Date().toISOString() }));
  }

  function addText() {
    setProject(p => ({
      ...p,
      textLayers: [...p.textLayers, { id: crypto.randomUUID(), text: 'Nuevo texto', x: 20, y: 20, fontSize: 32, color: '#ffffff', bold: true }],
      updatedAt: new Date().toISOString(),
    }));
  }

  function togglePlayback() {
    if (!selectedAsset || selectedAsset.kind !== 'video' || !videoRef.current) return;
    setPlaying(v => !v);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selected || selectedAsset?.kind !== 'video') return;
    video.playbackRate = selected.speed;
    video.volume = selected.volume;
    video.currentTime = selected.sourceStart;
    if (playing) video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing, selected?.id, selected?.sourceStart, selected?.speed, selected?.volume, selectedAsset?.url]);

  return (
    <main className="editor-app">
      <header className="editor-header">
        <div><strong>ANDREW</strong><span> EDITOR</span><small> · Editor multimedia local</small></div>
        <input aria-label="Nombre del proyecto" value={project.name} onChange={e => setProject(p => ({ ...p, name: e.target.value, updatedAt: new Date().toISOString() }))} />
        <button onClick={() => inputRef.current?.click()}>Importar medios</button>
        <input ref={inputRef} hidden type="file" multiple accept="image/*,video/*,audio/*" onChange={e => void addFiles(e.target.files)} />
      </header>

      <div className="editor-body">
        <aside className="media-panel">
          <h2>Medios</h2>
          <button onClick={() => inputRef.current?.click()}>+ Añadir fotos / videos / audio</button>
          <div className="asset-list">{project.assets.map(asset => (
            <button className="asset" key={asset.id} onClick={() => addToTimeline(asset)}>
              {asset.kind === 'image' ? <img src={asset.url} alt="" /> : <div className="asset-icon">{asset.kind === 'video' ? 'VIDEO' : 'AUDIO'}</div>}
              <span>{asset.name}</span>
            </button>
          ))}</div>
        </aside>

        <section className="workspace">
          <div className="canvas-wrap">
            <div className="canvas" style={{ width, height }}>
              {selectedAsset?.kind === 'image' && <img className="preview-media" src={selectedAsset.url} alt="Vista previa" />}
              {selectedAsset?.kind === 'video' && <video ref={videoRef} className="preview-media" src={selectedAsset.url} playsInline controls={false} onEnded={() => setPlaying(false)} />}
              {!selectedAsset && <span>Importa un medio y agrégalo a la línea de tiempo</span>}
              {project.textLayers.map(layer => <div key={layer.id} className="text-layer" style={{ left: `${layer.x}%`, top: `${layer.y}%`, fontSize: layer.fontSize, color: layer.color, fontWeight: layer.bold ? 700 : 400 }}>{layer.text}</div>)}
            </div>
          </div>

          <div className="transport">
            <button onClick={togglePlayback}>{playing ? 'Pausa' : 'Reproducir'}</button>
            <button onClick={addText}>+ Texto</button>
            <span>{project.currentTime.toFixed(1)} s</span>
            <select value={project.aspectRatio} onChange={e => setProject(p => ({ ...p, aspectRatio: e.target.value as EditorProject['aspectRatio'], updatedAt: new Date().toISOString() }))}>
              <option value="9:16">9:16 Vertical</option><option value="16:9">16:9 Horizontal</option><option value="1:1">1:1 Cuadrado</option>
            </select>
          </div>

          <div className="timeline">
            <div className="timeline-ruler">{Array.from({ length: 11 }, (_, i) => <span key={i}>{i}s</span>)}</div>
            {project.clips.map(clip => {
              const asset = project.assets.find(a => a.id === clip.assetId);
              return <button key={clip.id} className={`clip ${clip.id === project.selectedClipId ? 'selected' : ''}`} style={{ width: Math.max(90, clip.duration * 55) }} onClick={() => { setPlaying(false); setProject(p => ({ ...p, selectedClipId: clip.id })); }}>{asset?.name ?? 'Medio'}<small>{clip.duration.toFixed(1)}s</small></button>;
            })}
          </div>
        </section>

        <aside className="inspector">
          <h2>Inspector</h2>
          {selected ? <>
            <label>Duración<input type="number" min="0.1" step="0.1" value={selected.duration} onChange={e => updateSelected({ duration: Math.max(0.1, Number(e.target.value)) })} /></label>
            <label>Inicio fuente<input type="number" min="0" step="0.1" value={selected.sourceStart} onChange={e => updateSelected({ sourceStart: Math.max(0, Number(e.target.value)) })} /></label>
            <label>Velocidad<input type="number" min="0.1" step="0.1" value={selected.speed} onChange={e => updateSelected({ speed: Math.max(0.1, Number(e.target.value)) })} /></label>
            <label>Volumen<input type="range" min="0" max="1" step="0.05" value={selected.volume} onChange={e => updateSelected({ volume: Number(e.target.value) })} /></label>
            <button className="danger" onClick={removeSelected}>Eliminar clip</button>
          </> : <p>Selecciona un clip para editarlo.</p>}
          <hr/><h3>Motor</h3><p>Medios locales, vista previa, velocidad, volumen y capas de texto.</p>
          <p className="muted">Exportación, cortes, filtros, transiciones y mezcla multipista son las siguientes capas.</p>
        </aside>
      </div>
    </main>
  );
}
