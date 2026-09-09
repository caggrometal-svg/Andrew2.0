import React, { useEffect, useRef, useState } from "react";
import { aiClient, type ChatMessage } from "../../network/aiClient";
import { loadChatHistory, saveChatHistory } from "../../utils/chatStorage";
import "./AndrewChat.css";

const initialMessage: ChatMessage = { role: "assistant", content: "Hola. Soy Andrew 2.0. ¿En qué trabajamos hoy?" };

export const AndrewChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadChatHistory().then((history) => {
      setMessages(history.length ? history : [initialMessage]);
      setLoaded(true);
    }).catch(() => {
      setMessages([initialMessage]);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) void saveChatHistory(messages).catch(() => undefined);
  }, [messages, loaded]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || !loaded || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const response = await aiClient.sendMessage(next);
      setMessages((current) => [...current, { role: "assistant", content: response.message }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible conectar con Andrew.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="andrew-chat" aria-label="Andrew 2.0">
      <header className="andrew-chat__header">
        <div><span className="andrew-chat__eyebrow">ASISTENTE PERSONAL</span><h1>Andrew 2.0</h1></div>
        <span className={sending ? "andrew-status is-working" : "andrew-status"}>{sending ? "Procesando" : "En línea"}</span>
      </header>
      <div className="andrew-chat__messages">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`andrew-message andrew-message--${message.role}`}>
            <div className="andrew-message__label">{message.role === "user" ? "Tú" : "Andrew"}</div>
            <div className="andrew-message__bubble">{message.content}</div>
          </div>
        ))}
        {sending && <div className="andrew-thinking"><span /><span /><span /> Andrew está pensando…</div>}
        {error && <div className="andrew-error">{error}</div>}
        <div ref={bottom} />
      </div>
      <form className="andrew-chat__composer" onSubmit={send}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Escribe un mensaje para Andrew…" disabled={!loaded || sending} />
        <button type="submit" disabled={!loaded || sending || !input.trim()} aria-label="Enviar">➤</button>
      </form>
    </section>
  );
};

export default AndrewChat;
