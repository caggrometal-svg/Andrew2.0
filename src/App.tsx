import { useEffect, useRef, useState } from 'react';
import './styles.css';

export default function App() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [input, setInput] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = chatRef.current;
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  function sendMessage() {
    const value = input.trim();
    if (!value) return;
    setMessages((current) => [...current, { role: 'user', text: value }]);
    setInput('');
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">IAC33 · NEURAL RUNTIME</span>
          <h1>Andrew 2.0</h1>
          <p>Asistente personal · análisis · memoria · creación multimedia</p>
        </div>
        <span className="status-pill">Listo</span>
      </header>
      <nav className="mode-bar" aria-label="Secciones">
        <button className="mode-button active" type="button">Andrew Chat</button>
        <button className="mode-button" type="button">Multimedia / Video</button>
      </nav>
      <section className="chat-panel">
        <div ref={chatRef} className="messages" role="log" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && <div className="empty-state">Listo · sistema preparado</div>}
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <span className="message-label">{message.role === 'user' ? 'Tú' : 'Andrew 2.0'}</span>
              <div className="message-body">{message.text}</div>
            </article>
          ))}
          <div ref={endRef} aria-hidden="true" />
        </div>
        <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <input className="composer-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" />
          <button className="send-button" type="submit" disabled={!input.trim()}>Enviar</button>
        </form>
      </section>
    </main>
  );
}
