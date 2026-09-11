import { useEffect, useRef, useState } from 'react';
import { createAndrewBridgeClient, type AndrewBridgeClient } from '../bridge/client';
import type { RuntimeParams, RuntimeParameterKey, RuntimeParameterValue } from '../bridge/types';
import { sendAndrewMessage, uploadVideoInChunks, type AndrewAttachment } from '../network/andrewBackend';
import { sendThroughBridge } from '../network/andrewBridge';
import { loadChatHistory, saveChatHistory, type PersistedChatMessage } from '../storage/chatPersistence';

type ChatMessage = PersistedChatMessage & { attachment?: AndrewAttachment };
type Props = { conversationId: string };

type MutableRuntimePatch = {
  model?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  syncEnabled?: boolean;
};

const DEFAULT_RUNTIME: RuntimeParams = { model: 'default', timeoutMs: 30000, pollIntervalMs: 5000, syncEnabled: true };
const STATUS_POLL_MS = 5000;

function normalizeRuntime(value: unknown): Partial<RuntimeParams> {
  if (!value || typeof value !== 'object') return {};

  const source = value as Record<string, unknown>;

  const runtime =
    typeof source.runtime === 'object' && source.runtime
      ? (source.runtime as Record<string, unknown>)
      : source;

  const result: MutableRuntimePatch = {};

  if (typeof runtime.model === 'string') {
    result.model = runtime.model;
  }

  if (
    typeof runtime.timeoutMs === 'number' &&
    Number.isFinite(runtime.timeoutMs)
  ) {
    result.timeoutMs = runtime.timeoutMs;
  }

  if (
    typeof runtime.pollIntervalMs === 'number' &&
    Number.isFinite(runtime.pollIntervalMs)
  ) {
    result.pollIntervalMs = runtime.pollIntervalMs;
  }

  if (typeof runtime.syncEnabled === 'boolean') {
    result.syncEnabled = runtime.syncEnabled;
  }

  return result;
}

export default function AndrewChat({ conversationId }: Props) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => loadChatHistory() as ChatMessage[]);
  const [chatBusy, setChatBusy] = useState(false);
  const [text, setText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachment, setAttachment] = useState<AndrewAttachment | undefined>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [bridgeAvailable, setBridgeAvailable] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeParams>(DEFAULT_RUNTIME);
  const [runtimeSyncing, setRuntimeSyncing] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const wasAtBottomRef = useRef(true);
  const bridgeClientRef = useRef<AndrewBridgeClient | null>(null);

  if (bridgeClientRef.current === null && typeof window !== 'undefined' && window.AndrewBridge) {
    bridgeClientRef.current = createAndrewBridgeClient(window.AndrewBridge);
  }

  useEffect(() => {
    const client = bridgeClientRef.current;
    if (!client) return;

    let active = true;
    let timer: number | undefined;
    setBridgeAvailable(true);

    const refreshRuntime = async () => {
      try {
        const status = await client.requestStatus();
        if (!active) return;
        const next = normalizeRuntime(status);
        if (Object.keys(next).length) setRuntime(previous => ({ ...previous, ...next }));
        setBridgeAvailable(true);
      } catch {
        if (active) setBridgeAvailable(false);
      }
    };

    void refreshRuntime();
    timer = window.setInterval(() => void refreshRuntime(), STATUS_POLL_MS);

    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => saveChatHistory(chatMessages), [chatMessages]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container || !wasAtBottomRef.current) return;
    const frame = requestAnimationFrame(() => container.scrollTo({ top: container.scrollHeight, behavior: 'auto' }));
    return () => cancelAnimationFrame(frame);
  }, [chatMessages]);

  function handleChatScroll() {
    const container = chatScrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    wasAtBottomRef.current = distanceFromBottom <= 48;
  }

  async function handleFile(file: File | undefined) {
    if (!file || (!file.type.startsWith('image/') && !file.type.startsWith('video/'))) return;
    if (file.size > 250 * 1024 * 1024) return;
    if (file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) return;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setAttachment({ type: 'image', name: file.name, mimeType: file.type, dataUrl, size: file.size });
      setAttachmentFile(null);
    } else {
      setAttachment({ type: 'video', name: file.name, mimeType: file.type, size: file.size });
      setAttachmentFile(file);
      setUploadProgress(0);
    }
  }

  async function handleRuntimeParameter(key: RuntimeParameterKey, value: RuntimeParameterValue) {
    const client = bridgeClientRef.current;
    if (!client) return;
    setRuntimeSyncing(true);
    try {
      await client.setRuntimeParameter(key, value);
      await client.syncNow();
      const verified = normalizeRuntime(await client.requestStatus());
      setRuntime(previous => ({ ...previous, ...verified }));
      setBridgeAvailable(true);
    } catch (error) {
      console.error('Error sincronizando parámetro nativo:', error);
      setBridgeAvailable(false);
    } finally {
      setRuntimeSyncing(false);
    }
  }

  async function sendChat() {
    const message = text.trim() || (attachment ? 'Analiza el archivo adjunto.' : '');
    if (!message || chatBusy) return;
    wasAtBottomRef.current = true;
    setChatBusy(true);
    try {
      const bridgeClient = bridgeClientRef.current;
      if (bridgeClient && runtime.syncEnabled) {
        try { await bridgeClient.syncNow(); } catch { setBridgeAvailable(false); }
      }
      let preparedAttachment = attachment;
      if (attachment?.type === 'video' && attachmentFile) preparedAttachment = await uploadVideoInChunks(attachmentFile, setUploadProgress);
      const userMessage: ChatMessage = { role: 'user', text: message, attachment: preparedAttachment };
      const nextMessages = [...chatMessages, userMessage];
      setChatMessages(nextMessages);
      setText(''); setAttachment(undefined); setAttachmentFile(null); setUploadProgress(null);
      const result = preparedAttachment
        ? await sendAndrewMessage({ message, conversationId, memory: nextMessages.slice(-10).map(item => `${item.role}: ${item.text}`), attachment: preparedAttachment })
        : await sendThroughBridge(message, conversationId);
      setChatMessages(current => [...current, { role: 'assistant', text: result.reply }]);
    } catch (error) {
      setChatMessages(current => [...current, { role: 'assistant', text: error instanceof Error ? `No pude completar la solicitud: ${error.message}` : 'No pude conectar con Andrew.' }]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <section className="chat-root" aria-label="Andrew Chat">
      <div ref={chatScrollRef} className="chat-messages" role="log" aria-live="polite" aria-relevant="additions text" onScroll={handleChatScroll}>
        {chatMessages.length === 0 && <div className="chat-empty">Escribe a Andrew o adjunta una imagen/video para comenzar.</div>}
        {chatMessages.map((item, index) => (
          <article key={`${item.role}-${index}`} className={`chat-message ${item.role === 'user' ? 'is-user' : 'is-assistant'}`}>
            <div className="chat-message-label">{item.role === 'user' ? 'Tú' : 'Andrew 2.0'}</div>
            {item.attachment && <div className="chat-attachment">Adjunto: {item.attachment.name} · {item.attachment.type}</div>}
            <div className="chat-message-text">{item.text}</div>
          </article>
        ))}
        {chatBusy && <article className="chat-message is-assistant chat-processing">Procesando…</article>}
      </div>

      <div className="bridge-runtime" aria-label="Estado del runtime Android">
        <span>Runtime: {runtime.model}</span>
        <span>{runtime.syncEnabled ? 'Sync ON' : 'Sync OFF'}</span>
        <span>{runtimeSyncing ? 'Sincronizando…' : 'Persistido'}</span>
        <select value={runtime.model} disabled={!bridgeAvailable || runtimeSyncing} onChange={event => void handleRuntimeParameter('model', event.target.value)} aria-label="Modelo">
          <option value="default">Default</option>
          <option value="advanced">Advanced</option>
        </select>
        <label><input type="checkbox" checked={runtime.syncEnabled} disabled={!bridgeAvailable || runtimeSyncing} onChange={event => void handleRuntimeParameter('syncEnabled', event.target.checked)} /> Sincronización</label>
      </div>

      {attachment && <div className="attachment-preview">{attachment.name} · {attachment.mimeType}{uploadProgress !== null ? ` · ${uploadProgress}%` : ''}</div>}

      <form className="chat-composer" onSubmit={event => { event.preventDefault(); void sendChat(); }}>
        <label className="attach-button" aria-label="Adjuntar imagen o video">+<input type="file" accept="image/*,video/mp4,video/*" hidden onChange={event => void handleFile(event.target.files?.[0])} disabled={chatBusy} /></label>
        <input className="chat-input" value={text} onChange={event => setText(event.target.value)} placeholder="Escribe una instrucción para Andrew…" disabled={chatBusy} aria-label="Mensaje" />
        <button className="send-button" type="submit" disabled={chatBusy || (!text.trim() && !attachment)}>{chatBusy ? 'Procesando' : 'Enviar'}</button>
      </form>

      <div className="bridge-status" aria-live="polite">Bridge: {bridgeAvailable ? 'native client activo' : 'gateway persistente'} · Backend: andrew2-api.onrender.com</div>
    </section>
  );
}
