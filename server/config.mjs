import { resolveProvider } from './provider-runtime.mjs';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const provider = resolveProvider(process.env);
const databaseUrl = required('DATABASE_URL');

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  openaiApiKey: provider.apiKey,
  openaiModel: provider.model,
  aiProvider: provider.id,
  aiEndpoint: provider.endpoint,
  databaseUrl,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()).filter(Boolean),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 180),
};
