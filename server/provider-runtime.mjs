const trim = (value) => typeof value === 'string' ? value.trim() : '';

const providers = {
  openai: {
    id: 'openai',
    endpoint: 'https://api.openai.com/v1/responses',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
  },
  openai_compatible: {
    id: 'openai_compatible',
    endpoint: '',
    apiKeyEnv: 'AI_API_KEY',
    modelEnv: 'AI_MODEL',
  },
};

export function resolveProvider(env = process.env) {
  const requested = trim(env.AI_PROVIDER).toLowerCase() || 'openai';
  const definition = providers[requested];
  if (!definition) {
    throw new Error(`Unsupported AI_PROVIDER: ${requested}`);
  }

  const apiKey = trim(env[definition.apiKeyEnv] || env.OPENAI_API_KEY);
  const model = trim(env[definition.modelEnv] || env.OPENAI_MODEL) || 'gpt-5.6-luna';
  const baseUrl = trim(env.AI_BASE_URL) || definition.endpoint;

  if (!apiKey) throw new Error(`Missing AI API key for provider: ${definition.id}`);
  if (!baseUrl) throw new Error(`Missing AI_BASE_URL for provider: ${definition.id}`);
  if (/^sk[-_]/i.test(model)) throw new Error('Invalid AI model: an API key was supplied as the model name.');

  return { id: definition.id, apiKey, model, endpoint: baseUrl };
}

export function listProviders() {
  return Object.values(providers).map(({ id }) => id);
}
