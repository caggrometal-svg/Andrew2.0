from pathlib import Path

p = Path('src/ui/App.tsx')
text = p.read_text()

marker = "function getConversationId(): string {"
helper = '''function normalizeName(value: string): string {
  return value.trim().replace(/\\s+/g, ' ').replace(/^[,.:;!?]+|[,.:;!?]+$/g, '').slice(0, 80);
}

function extractLocalName(message: string): string | null {
  const text = message.trim();
  const patterns = [
    /^me llamo\\s+(.+?)$/i,
    /^mi nombre es\\s+(.+?)$/i,
    /^soy\\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{1,60})$/i,
    /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]{1,60})\\s+y\\s+t[uú]$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = normalizeName(match[1]);
      if (name && name.split(/\\s+/).length <= 4) return name;
    }
  }
  return null;
}

function localMemoryReply(message: string): string | null {
  const text = message.trim().toLocaleLowerCase('es');
  const stored = normalizeName(safeRead(USER_NAME_KEY) || '');
  const extracted = extractLocalName(message);
  if (extracted) {
    safeWrite(USER_NAME_KEY, extracted);
    return `Entendido. Recordaré localmente que tu nombre es ${extracted}.`;
  }
  if (/^(?:andrew[ ,]*)?(?:recuerda|recordar|guarda|guardar)\\s+(?:mi nombre|que me llamo)$/i.test(message)) {
    return stored ? `Sí. Tu nombre guardado localmente es ${stored}.` : 'Todavía no tengo tu nombre guardado localmente. Dime cómo te llamas.';
  }
  if (/^(?:cu[aá]l|cual|dime)\\s+(?:es )?mi nombre\\??$/i.test(text) || /^como me llamo\\??$/i.test(text) || /^di(?:me)?\\s+mi nombre\\??$/i.test(text) || /^(?:quien|quién)\\s+soy\\??$/i.test(text)) {
    return stored ? `Tu nombre es ${stored}.` : 'Todavía no tengo tu nombre guardado. Dime cómo te llamas.';
  }
  return null;
}

'''

if 'function localMemoryReply(message: string): string | null' not in text:
    if marker not in text:
        raise SystemExit('App.tsx marker not found')
    text = text.replace(marker, helper + marker, 1)

old = '''    setMessages(prev => [...prev, userMessage]);
    setDraft('');
    setBusy(true);
    setNetwork('connecting');
    try {'''
new = '''    setMessages(prev => [...prev, userMessage]);
    setDraft('');

    const localReply = localMemoryReply(text);
    if (localReply) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: localReply, createdAt: Date.now() }]);
      setStatusText('Memoria local · sin llamada a IA externa');
      return;
    }

    setBusy(true);
    setNetwork('connecting');
    try {'''
if old not in text:
    raise SystemExit('sendMessage insertion marker not found')
text = text.replace(old, new, 1)

old_status = "      <div className=\"status-pill\"><span className=\"status-dot\" />{networkStatus === 'error' ? 'Offline' : 'Activo'}</div>"
new_status = "      <div className=\"status-pill\"><span className=\"status-dot\" />{networkStatus === 'error' ? 'Offline' : networkStatus === 'degraded' ? 'IA limitada' : 'Activo'}</div>"
if old_status in text:
    text = text.replace(old_status, new_status, 1)

old_network = '''    else if (next === 'connected') setStatusText('Conexión estable');
    else setStatusText('Conexión interrumpida');'''
new_network = '''    else if (next === 'connected') setStatusText('Conexión estable');
    else if (next === 'degraded') setStatusText('IA externa temporalmente limitada · funciones locales disponibles');
    else setStatusText('Conexión interrumpida');'''
if old_network in text:
    text = text.replace(old_network, new_network, 1)

p.write_text(text)
print('Applied local-memory-first patch to', p)
