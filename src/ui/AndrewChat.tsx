import { useEffect, useMemo, useRef, useState } from 'react';
import { sendAndrewMessage, uploadVideoInChunks } from '../network/andrewBackend';
import { loadChatHistory, saveChatHistory, type PersistedChatMessage } from '../storage/chatPersistence';

type ChatMessage = PersistedChatMessage;

type Props = {
  onBack?: () => void;
};

export default function AndrewChat({ onBack }: Props) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => loadChatHistory());
  const [chatBusy, setChatBusy] = useState(false);
  const [text, setText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachment, setAttachment] = useState<unknown>(undefined);
  const [uploadProgress, setUploadProgress] = useState(0);
  const conversationIdRef = useRef(crypto.randomUUID());

  useEffect(() => saveChatHistory(chatMessages), [chatMessages]);

  const memory = useMemo(() => chatMessages.slice(-10), [chatMessages]);

  async function sendChat() {
    const message = text.trim();
    if (!message || chatBusy) return;

    setChatBusy(true);
    try {
      let preparedAttachment = attachment;
      if (attachmentFile && attachmentFile.type.startsWith('video/')) {
        const uploadId = await uploadVideoInChunks(attachmentFile, setUploadProgress);
        preparedAttachment = { type: 'video', uploadId, name: attachmentFile.name };
      }

      const userMessage: ChatMessage = { role: 'user', text: message, attachment: preparedAttachment };
      const nextMessages = [...chatMessages, userMessage];
      setChatMessages(nextMessages);
      setText('');
      setAttachment(undefined);
      setAttachmentFile(null);
      setUploadProgress(0);

      const result = await sendAndrewMessage({
        message,
        conversationId: conversationIdRef.current,
        memory: nextMessages.slice(-10),
        attachment: preparedAttachment,
      });

      setChatMessages((current) => [...current, { role: 'assistant', text: result.reply }]);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'No pude completar la solicitud.';
      setChatMessages((current) => [...current, { role: 'assistant', text: messageText }]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <section className="andrew-chat" aria-label="Andrew Chat">
      <header className="andrew-chat__header">
        {onBack && <button type="button" onClick={onBack}>Atrás</button>}
        <h1>Andrew</h1>
      </header>

      <main className="andrew-chat__messages">
        {chatMessages.map((item, index) => (
          <article key={`${item.role}-${index}`} className={`message message--${item.role}`}>
            {item.text}
          </article>
        ))}
        {chatBusy && <article className="message message--assistant">Procesando…</article>}
      </main>

      <footer className="andrew-chat__composer">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void sendChat(); }}
          placeholder="Escribe a Andrew…"
          disabled={chatBusy}
        />
        <input
          type="file"
          accept="video/mp4,video/*,image/*"
          onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
          disabled={chatBusy}
        />
        <button type="button" onClick={() => void sendChat()} disabled={chatBusy || !text.trim()}>
          Enviar
        </button>
      </footer>
    </section>
  );
}
