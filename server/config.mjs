const text = (name, fallback = '') => (process.env[name] ?? fallback).trim();
const bool = (name, fallback = false) => /^(1|true|yes)$/i.test(text(name, fallback ? 'true' : ''));
const number = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const openaiApiKey = text('OPENAI_API_KEY');
const openaiModel = text('OPENAI_MODEL', 'gpt-5.6-luna');
if (/^sk[-_]/i.test(openaiModel)) throw new Error('Invalid OPENAI_MODEL: an OpenAI API key was supplied as the model name.');

const provider = (name, defaults = {}) => ({
  apiKey: text(`${name}_API_KEY`),
  endpoint: text(`${name}_ENDPOINT`, defaults.endpoint || ''),
  model: text(`${name}_MODEL`, defaults.model || ''),
  protocol: text(`${name}_PROTOCOL`, defaults.protocol || 'chat'),
  supportsVision: bool(`${name}_SUPPORTS_VISION`, defaults.supportsVision || false),
});

export const config = {
  port: number('PORT', 10000),
  host: text('HOST', '0.0.0.0'),
  openaiApiKey,
  openaiModel,
  primaryEndpoint: text('OPENAI_ENDPOINT', 'https://api.openai.com/v1/responses'),
  secondaryApiKey: text('SECONDARY_API_KEY'),
  secondaryEndpoint: text('SECONDARY_ENDPOINT'),
  secondaryModel: text('SECONDARY_MODEL'),
  secondaryProtocol: text('SECONDARY_PROTOCOL', 'chat'),
  secondarySupportsVision: bool('SECONDARY_SUPPORTS_VISION'),
  routingPolicy: text('ANDREW_ROUTING_POLICY', 'balanced'),
  timeoutMs: number('AI_TIMEOUT_MS', 60000),
  maxAttempts: number('AI_MAX_ATTEMPTS', 2),
  providers: {
    anthropic: provider('ANTHROPIC', { protocol: 'messages', supportsVision: true }),
    deepseek: provider('DEEPSEEK'),
    groq: provider('GROQ'),
    gemini: provider('GEMINI', { protocol: 'gemini', supportsVision: true }),
  },
};
