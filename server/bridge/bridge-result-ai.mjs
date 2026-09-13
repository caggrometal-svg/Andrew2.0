import { createResponse } from '../openai.mjs';

export async function processBridgeResult({ command, result }) {
  return createResponse({
    message: `Bridge result for ${command}: ${JSON.stringify(result)}. Explain the result briefly to the user.`,
    memory: [],
    history: [],
  });
}
