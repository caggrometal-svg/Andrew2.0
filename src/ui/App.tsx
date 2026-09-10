import { useMemo, useState } from 'react';
import { assessEvidence, type Evidence } from '@analysis/critical';
import { earthquakeRisk, socialEventRisk, type Signal } from '@analysis/probabilistic';
import { defaultCapabilities } from '@assistant/autonomy';
import { createC33Brief } from '@assistant/expedienteC33';
import { getRecentEarthquakes } from '@network/publicWeb';
import { sendAndrewMessage } from '@network/andrewBackend';

const demoSignals: Signal[] = [
  { name: 'Actividad reciente', value: 0.62, weight: 1.2 },
  { name: 'Tendencia histórica', value: 0.48, weight: 1 },
  { name: 'Cambio de régimen', value: 0.31, weight: 0.8 },
  { name: 'Señal secundaria', value: 0.22, weight: 0.6 },
];
const demoEvidence: Evidence[] = [
  { source: 'Fuente A', claim: 'Señal observada', reliability: 0.82 },
  { source: 'Fuente B', claim: 'Interpretación alternativa', reliability: 0.58, contradicts: ['Fuente A'] },
];

type ChatMessage = { role: 'user' | 'assistant'; text: string };

export default function App() {
  const [domain, setDomain] = useState<'earthquake' | 'social'>('earthquake');
  const [topic, setTopic] = useState('señales extrañas en el cielo');
  const [brief, setBrief] = useState(createC33Brief(topic));
  const [quakeCount, setQuakeCount] = useState<number | null>(null);
  const [status, setStatus] = useState('Listo');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  const result = useMemo(() => domain === 'earthquake' ? earthquakeRisk(demoSignals) : socialEventRisk(demoSignals), [domain]);
  const critical = useMemo(() => assessEvidence(demoEvidence), []);

  async function updateNetwork() {
    setStatus('Consultando datos públicos…');
    try { const data = await getRecentEarthquakes(); setQuakeCount(data.features.length); setStatus('Red pública actualizada'); }
    catch { setStatus('No fue posible consultar la fuente'); }
  }

  async function sendChat() {
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatInput('');
    setChatMessages(current => [...current, { role: 'user', text: message }]);
    setChatBusy(true);
    setStatus('Andrew está procesando…');
    try {
      const memory = chatMessages.slice(-10).map(item => `${item.role}: ${item.text}`);
      const response = await sendAndrewMessage({ message, conversationId, memory });
      setChatMessages(current => [...current, { role: 'assistant', text: response.reply }]);
      setStatus(`Conectado · ${response.model}`);
    } catch (error) {
      setChatMessages(current => [...current, { role: 'assistant', text: error instanceof Error ? `Error de conexión: ${error.message}` : 'Error de conexión con Andrew.' }]);
      setStatus('Backend no disponible');
    } finally {
      setChatBusy(false);
    }
  }

  return <main style={{ maxWidth: 1050, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#0b0f14', color: '#e8edf2', minHeight: '100vh' }}>
    <h1>Andrew 2.0</h1><p>Pensador · visionario · análisis crítico · autonomía configurable</p>
    <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
      <article><h2>Chat IA</h2><p>Puente OpenAI: <b>{chatBusy ? 'PROCESANDO' : 'LISTO'}</b></p><div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #26313d', padding: 12, borderRadius: 8 }}>{chatMessages.length === 0 ? <small>Escribe un mensaje para conectar Andrew 2.0 con su backend seguro.</small> : chatMessages.map((item, index) => <p key={index}><b>{item.role === 'user' ? 'Tú' : 'Andrew'}:</b> {item.text}</p>)}</div><div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendChat(); }} placeholder='Escribe a Andrew…' disabled={chatBusy} style={{ flex: 1, padding: 10 }} /><button onClick={() => void sendChat()} disabled={chatBusy || !chatInput.trim()}>Enviar</button></div><small>La API key nunca se envía desde esta aplicación.</small></article>
      <article><h2>Red mundial pública</h2><p>Acceso web público: <b>ACTIVO</b></p><p>Datos satelitales públicos: <b>ACTIVOS</b></p><button onClick={updateNetwork}>Actualizar datos sísmicos</button>{quakeCount !== null && <p>Eventos recibidos: {quakeCount}</p>}<small>Andrew no controla satélites ni accede a redes privadas o restringidas.</small></article>
      <article><h2>Pronóstico</h2><button onClick={() => setDomain('earthquake')}>Riesgo sísmico</button>{' '}<button onClick={() => setDomain('social')}>Eventos sociales</button><p>Horizonte: {result.horizon} · Confianza: {result.confidence}</p><ol>{result.scenarios.map(s => <li key={s.label}>{s.label}: <strong>{Math.round(s.probability * 100)}%</strong></li>)}</ol><small>{result.warning}</small></article>
      <article><h2>Autonomía</h2><p>Nivel conceptual: <b>ASSISTED</b></p><ul>{defaultCapabilities.map(c => <li key={c.id}>{c.name}</li>)}</ul></article>
      <article><h2>Pensamiento crítico</h2><p>Confianza global: <strong>{critical.overallConfidence}</strong></p><p>Hechos: {critical.facts.length} · Contradicciones: {critical.contradictions.length} · Hipótesis: {critical.hypotheses.length}</p></article>
    </section>
    <section style={{ marginTop: 20 }}><h2>Expediente C33</h2><input value={topic} onChange={e => setTopic(e.target.value)} style={{ width: '100%', padding: 10, boxSizing: 'border-box' }} /><button style={{ marginTop: 8 }} onClick={() => setBrief(createC33Brief(topic))}>Crear expediente</button><h3>{brief.title}</h3><p><b>Hook:</b> {brief.hook}</p><p><b>Tesis:</b> {brief.thesis}</p><p><b>Contrapuntos:</b> {brief.counterpoints.join(' · ')}</p><p><b>Guion:</b> {brief.script}</p></section>
    <footer>{status}</footer>
  </main>;
}
