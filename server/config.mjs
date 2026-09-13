const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const openaiApiKey = required('OPENAI_API_KEY');
const openaiModel = (process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim();
const primaryEndpoint = (process.env.AI_PRIMARY_ENDPOINT || 'https://api.openai.com/v1/responses').trim();

if (/^sk[-_]/i.test(openaiModel)) throw new Error('Invalid OPENAI_MODEL: an OpenAI API key was supplied as the model name.');

const optionalProvider = (prefix, defaults = {}) => ({
  apiKey: (process.env[`${prefix}_API_KEY`] || '').trim(),
  endpoint: (process.env[`${prefix}_ENDPOINT`] || defaults.endpoint || '').trim(),
  model: (process.env[`${prefix}_MODEL`] || defaults.model || '').trim(),
  supportsVision: /^(1|true|yes)$/i.test(process.env[`${prefix}_SUPPORTS_VISION`] || ''),
  protocol: defaults.protocol || 'chat',
  tier: Number(process.env[`${prefix}_TIER`] || defaults.tier || 3),
  weight: Math.max(1, Number(process.env[`${prefix}_WEIGHT`] || defaults.weight || 1)),
});

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  openaiApiKey,
  openaiModel,
  primaryEndpoint,
  secondaryApiKey: (process.env.AI_SECONDARY_API_KEY || '').trim(),
  secondaryEndpoint: (process.env.AI_SECONDARY_ENDPOINT || '').trim(),
  secondaryModel: (process.env.AI_SECONDARY_MODEL || 'deepseek-chat').trim(),
  secondarySupportsVision: /^(1|true|yes)$/i.test(process.env.AI_SECONDARY_SUPPORTS_VISION || ''),
  usagePolicy: 'unlimited-app',
  appEnforcedQuota: false,
  aiMaxConcurrent: Number(process.env.AI_MAX_CONCURRENT || 32),
  providers: {
    gemini: optionalProvider('AI_GEMINI', { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', tier: 2 }),
    anthropic: optionalProvider('AI_ANTHROPIC', { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514', tier: 2, protocol: 'messages' }),
    groq: optionalProvider('AI_GROQ', { endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', tier: 3 }),
    deepseek: optionalProvider('AI_DEEPSEEK', { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', tier: 3 }),
    local: optionalProvider('AI_LOCAL', { endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'local-model', tier: 4 }),
    edge: optionalProvider('AI_EDGE', { endpoint: '', model: 'edge-model', tier: 4 }),
  },
  tiers: {
    1: { name: 'high-performance-api-pool', providers: ['primary', 'secondary'] },
    2: { name: 'commercial-fallback', providers: ['anthropic', 'gemini'] },
    3: { name: 'aggregator-open-source', providers: ['deepseek', 'groq'] },
    4: { name: 'local-edge-ready', providers: ['local', 'edge'] },
  },
  routingPolicy: (process.env.AI_ROUTING_POLICY || 'balanced').trim().toLowerCase(),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 180),
};
