const DEFAULT_MODEL = 'gpt-5.6-luna';
const ENDPOINT = 'https://api.openai.com/v1/responses';

function requireApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  return key;
}

function normalizeTimeout(value) {
  if (value === undefined) return 30_000;
  if (!Number.isFinite(value) || value < 1 || value > 300_000) throw new TypeError('invalid timeoutMs');
  return Math.trunc(value);
}

function extractText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    if (!item || typeof item !== 'object' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('');
}

export class OpenAIChatProvider {
  constructor({ fetchImpl = globalThis.fetch, apiKey = process.env.OPENAI_API_KEY, defaultModel = process.env.OPENAI_MODEL || DEFAULT_MODEL } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('OPENAI_API_KEY is not configured');
    if (typeof defaultModel !== 'string' || !defaultModel.trim()) throw new TypeError('default model is required');
    this.id = 'openai';
    this.fetchImpl = fetchImpl;
    this.apiKey = apiKey.trim();
    this.defaultModel = defaultModel.trim();
  }

  async execute(request) {
    const timeoutMs = normalizeTimeout(request.timeoutMs);
    const model = typeof request.model === 'string' && request.model.trim() ? request.model.trim() : this.defaultModel;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: request.messages }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`openai_http_${response.status}`);
      const content = extractText(payload);
      if (!content) throw new Error('openai_empty_response');
      return { provider: this.id, model, content };
    } finally {
      clearTimeout(timer);
    }
  }
}
