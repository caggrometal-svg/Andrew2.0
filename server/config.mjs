const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  openaiApiKey: required('OPENAI_API_KEY'),
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 65536),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 30),
};
