import { ProviderRouter } from './ai/provider-router.mjs';

export const router = new ProviderRouter();
export function getAIProviderHealth() { return router.getHealth(); }
