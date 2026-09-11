import { useEffect, useRef, useState } from 'react';
import { sendAndrewMessage, uploadVideoInChunks, type AndrewAttachment } from '../network/andrewBackend';
import { sendThroughBridge } from '../network/andrewBridge';
import { loadChatHistory, saveChatHistory, type PersistedChatMessage } from '../storage/chatPersistence';

type ChatMessage = PersistedChatMessage & { attachment?: AndrewAttachment };
type Props = { conversationId: string };

export default function AndrewChat({ conversationId }: Props) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => loadChatHistory() as ChatMessage[]);
  const [chatBusy, setChatBusy] = useState(false);
  const [text, setText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachment, setAttachment] = useState<AndrewAttachment | undefined>();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => saveChatHistory(chatMessages), [chatMessages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chatMessages, chatBusy]);

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

  async function sendChat() {
    const message = text.trim() || (attachment ? 'Analiza el archivo adjunto.' : '');
    if (!message || chatBusy) return;
    setChatBusy(true);
    try {
      let preparedAttachment = attachment;
      if (attachment?.type === 'video' && attachmentFile) preparedAttachment = await uploadVideoInChunks(attachmentFile, setUploadProgress);
      const userMessage: ChatMessage = { role: 'user', text: message, attachment: preparedAttachment };
      const nextMessages = [...chatMessages, userMessage];
      setChatMessages(nextMessages);
      setText('');
      setAttachment(undefined);
      setAttachmentFile(null);
      setUploadProgress(null);

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
    <section style={{ display: 'grid', gap: 12, minWidth: 0, width: '100%', overflow: 'hidden' }} aria-label="Andrew Chat">
      <div style={{ minHeight: 360, height: '52vh', maxHeight: 620, minWidth: 0, width: '100%', overflowY: 'auto', overflowX: 'hidden', display: 'grid', alignContent: 'start', gap: 10, padding: 8, boxSizing: 'border-box', overscrollBehavior: 'contain' }}>
        {chatMessages.length === 0 && <div style={{ display: 'grid', placeItems: 'center', minHeight: 280, opacity: .7, textAlign: 'center' }}>Escribe a Andrew o adjunta una imagen/video para comenzar.</div>}
        {chatMessages.map((item, index) => <article key={`${item.role}-${index}`} style={{ justifySelf: item.role === 'user' ? 'end' : 'start', width: 'fit-content', maxWidth: '88%', minWidth: 0, padding: '12px 14px', borderRadius: 14, background: item.role === 'user' ? '#18324a' : '#121a24', overflowWrap: 'anywhere', wordBreak: 'break-word', lineHeight: 1.5, boxSizing: 'border-box' }}><div style={{ fontSize: 11, opacity: .65, marginBottom: 4 }}>{item.role === 'user' ? 'Tú' : 'Andrew 2.0'}</div>{item.attachment && <div style={{ fontSize: 12, opacity: .75, marginBottom: 6, overflowWrap: 'anywhere' }}>Adjunto: {item.attachment.name} · {item.attachment.type}</div>}{item.text}</article>)}
        {chatBusy && <article style={{ opacity: .7 }}>Procesando…</article>}
        <div ref={bottomRef} aria-hidden="true" />
      </div>
      {attachment && <div style={{ minWidth: 0, padding: 10, borderRadius: 12, background: '#0b1119', overflowWrap: 'anywhere' }}>{attachment.name} · {attachment.mimeType}{uploadProgress !== null ? ` · ${uploadProgress}%` : ''}</div>}
      <div style={{ display: 'flex', gap: 8, minWidth: 0, width: '100%' }}>
        <label style={{ flex: '0 0 48px', minHeight: 44, display: 'grid', placeItems: 'center', borderRadius: 12, background: '#162333', cursor: 'pointer' }}>+<input type="file" accept="image/*,video/mp4,video/*" hidden onChange={event => void handleFile(event.target.files?.[0])} disabled={chatBusy} /></label>
        <input value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void sendChat(); }} placeholder="Escribe una instrucción para Andrew…" disabled={chatBusy} style={{ flex: '1 1 auto', minWidth: 0, width: 0, padding: '12px 14px', color: '#edf3f8', background: '#0a1018', border: '1px solid #26394d', borderRadius: 12, fontSize: 16, boxSizing: 'border-box' }} />
        <button type="button" onClick={() => void sendChat()} disabled={chatBusy || (!text.trim() && !attachment)} style={{ flex: '0 0 92px', minWidth: 0, minHeight: 44, borderRadius: 12, border: '1px solid #2b4057', background: '#214c72', color: '#eaf3fb' }}>{chatBusy ? 'Procesando' : 'Enviar'}</button>
      </div>
      <div aria-live="polite" style={{ minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word', fontSize: 12, opacity: .65 }}>Bridge: persistent gateway · Backend: andrew2-api.onrender.com</div>
    </section>
  );
}
