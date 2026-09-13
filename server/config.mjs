const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const openaiApiKey = required('OPENAI_API_KEY');
const openaiModel = (process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim();
const primaryEndpoint = (process.env.AI_PRIMARY_ENDPOINT || 'https://api.openai.com/v1/responses').trim();

if (/^sk[-_]/i.test(openaiModel)) {
  throw new Error('Invalid OPENAI_MODEL: an OpenAI API key was supplied as the model name.');
}

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  openaiApiKey,
  openaiModel,
  primaryEndpoint,
  secondaryApiKey: (process.env.AI_SECONDARY_API_KEY || '').trim(),
  secondaryEndpoint: (process.env.AI_SECONDARY_ENDPOINT || '').trim(),
  secondaryModel: (process.env.AI_SECONDARY_MODEL || 'deepseek-chat').trim(),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 180),
};
