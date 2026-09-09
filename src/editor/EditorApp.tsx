import { useEffect, useMemo, useRef, useState } from 'react';
import { createEditorProject, saveEditorProject } from './editor-storage';
import type { EditorProject, MediaAsset } from './types';

const ratioSize = { '9:16': [360, 640], '16:9': [640, 360], '1:1': [520, 520] } as const;

export default function EditorApp() {
  const [project, setProject] = useState<EditorProject>(() => createEditorProject('Nuevo proyecto'));
  const [playing, setPlaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [width, height] = ratioSize[project.aspectRatio];

  useEffect(() => {
    saveEditorProject(project);
  }, [project]);

  const selected = useMemo(() => project.clips.find(c => c.id === project.selectedClipId), [project]);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const assets: MediaAsset[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio',
      url: URL.createObjectURL(file),
      mimeType: file.type,
      size: file.size,
    }));
    setProject(p => ({ ...p, assets: [...p.assets, ...assets], updatedAt: new Date().toISOString() }));
  }

  function addToTimeline(asset: MediaAsset) {
    if (asset.kind === 'audio') return;
    const duration = asset.duration ?? 5;
    const start = project.clips.reduce((sum, clip) => sum + clip.duration, 0);
    setProject(p => ({
      ...p,
      clips: [...p.clips, { id: crypto.randomUUID(), assetId: asset.id, start, duration, sourceStart: 0, volume: 1, speed: 1 }],
      selectedClipId: p.clips[p.clips.length - 1]?.id,
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateSelected(patch: Partial<NonNullable<typeof selected>>) {
    if (!selected) return;
    setProject(p => ({ ...p, clips: p.clips.map(c => c.id === selected.id ? { ...c, ...patch } : c), updatedAt: new Date().toISOString() }));
  }

  function removeSelected() {
    if (!selected) return;
    setProject(p => ({ ...p, clips: p.clips.filter(c => c.id !== selected.id), selectedClipId: undefined, updatedAt: new Date().toISOString() }));
  }

  return (
    <main className="editor-app">
      <header className="editor-header">
        <div><strong>ANDREW</strong><span> EDITOR</span><small> · Proyecto multimedia</small></div>
        <input value={project.name} onChange={e => setProject(p => ({ ...p, name: e.target.value, updatedAt: new Date().toISOString() }))} />
        <button onClick={() => inputRef.current?.click()}>Importar medios</button>
        <input ref={inputRef} hidden type="file" multiple accept="image/*,video/*,audio/*" onChange={e => addFiles(e.target.files)} />
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
          <div className="canvas-wrap"><div className="canvas" style={{ width, height }}><span>Vista previa</span>{project.textLayers.map(layer => <div key={layer.id} className="text-layer" style={{ left: layer.x, top: layer.y, fontSize: layer.fontSize, fontWeight: layer.bold ? 700 : 400 }}>{layer.text}</div>)}</div></div>
          <div className="transport"><button onClick={() => setPlaying(v => !v)}>{playing ? 'Pausa' : 'Reproducir'}</button><span>{project.currentTime.toFixed(1)} s</span><select value={project.aspectRatio} onChange={e => setProject(p => ({ ...p, aspectRatio: e.target.value as EditorProject['aspectRatio'], updatedAt: new Date().toISOString() }))}><option value="9:16">9:16 Vertical</option><option value="16:9">16:9 Horizontal</option><option value="1:1">1:1 Cuadrado</option></select></div>
          <div className="timeline"><div className="timeline-ruler">{Array.from({ length: 11 }, (_, i) => <span key={i}>{i}s</span>)}</div>{project.clips.map(clip => { const asset = project.assets.find(a => a.id === clip.assetId); return <button key={clip.id} className={`clip ${clip.id === project.selectedClipId ? 'selected' : ''}`} style={{ width: Math.max(90, clip.duration * 55) }} onClick={() => setProject(p => ({ ...p, selectedClipId: clip.id }))}>{asset?.name ?? 'Medio'}<small>{clip.duration.toFixed(1)}s</small></button>; })}</div>
        </section>

        <aside className="inspector"><h2>Inspector</h2>{selected ? <><label>Duración<input type="number" min="0.1" step="0.1" value={selected.duration} onChange={e => updateSelected({ duration: Number(e.target.value) })} /></label><label>Velocidad<input type="number" min="0.1" step="0.1" value={selected.speed} onChange={e => updateSelected({ speed: Number(e.target.value) })} /></label><label>Volumen<input type="range" min="0" max="1" step="0.05" value={selected.volume} onChange={e => updateSelected({ volume: Number(e.target.value) })} /></label><button className="danger" onClick={removeSelected}>Eliminar clip</button></> : <p>Selecciona un clip para editarlo.</p>}<hr/><h3>Próximo</h3><p>Cortar · texto · filtros · transiciones · audio · exportación.</p></aside>
      </div>
    </main>
  );
}
