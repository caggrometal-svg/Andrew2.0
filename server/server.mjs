import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { securityHeaders } from './hardening.mjs';

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MODEL = (process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const MAX_BODY_BYTES = 1024 * 1024;
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').trim();

const responseHeaders = {
  ...securityHeaders,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Andrew-User-Id, X-Device-Id, X-Timestamp, X-Signature, X-Chunk-Start, X-Chunk-End, X-Upload-Size',
  'Access-Control-Max-Age': '600',
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...responseHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function applyHeaders(res) {
  for (const [name, value] of Object.entries(responseHeaders)) res.setHeader(name, value);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid_json'), { statusCode: 400 }); }
}

function textFromResponse(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function chat(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return { status: 400, body: { ok: false, error: 'message_required' } };
  if (!OPENAI_API_KEY) return { status: 503, body: { ok: false, error: 'OPENAI_API_KEY_MISSING', message: 'Backend IA no configurado.' } };

  const memory = Array.isArray(body.memory) ? body.memory.filter(v => typeof v === 'string').slice(0, 20) : [];
  const context = memory.length ? `Memoria local relevante:\n${memory.join('\n')}` : '';
  const input = context ? `${context}\n\nMensaje del usuario:\n${message}` : message;

  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input, store: false }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const upstreamMessage = data?.error?.message || `OpenAI HTTP ${upstream.status}`;
    return { status: upstream.status >= 500 ? 502 : upstream.status, body: { ok: false, error: 'OPENAI_REQUEST_FAILED', message: upstreamMessage } };
  }

  const reply = textFromResponse(data) || 'No recibí contenido de respuesta del modelo.';
  return {
    status: 200,
    body: {
      ok: true,
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : `conv:${randomUUID()}`,
      reply,
      responseId: typeof data.id === 'string' ? data.id : null,
      model: MODEL,
      learning: { eligible: true, source: 'local-memory-context' },
    },
  };
}

async function handler(req, res) {
  applyHeaders(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, status: 'ready', service: 'andrew2-backend', model: MODEL, openaiConfigured: Boolean(OPENAI_API_KEY) });
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const body = await readJson(req);
      const result = await chat(body);
      return send(res, result.status, result.body);
    } catch (error) {
      return send(res, Number(error?.statusCode) || 500, { ok: false, error: error?.message || 'internal_error' });
    }
  }

  if (url.pathname.startsWith('/api/media/video/')) {
    return send(res, 501, { ok: false, error: 'MEDIA_PIPELINE_NOT_READY', message: 'El canal de chat está operativo; el pipeline multimedia requiere su módulo de almacenamiento.' });
  }

  return send(res, 404, { ok: false, error: 'not_found' });
}

const server = http.createServer((req, res) => {
  handler(req, res).catch(error => {
    if (!res.headersSent) send(res, 500, { ok: false, error: 'internal_error' });
    else res.end();
    console.error('[Andrew2] request failure', error);
  });
});

server.listen(PORT, HOST, () => console.log(`[Andrew2] backend listening on ${HOST}:${PORT}`));
