import { assertToolInput, registerTool } from '../tool-registry';
import type { ToolDefinition, ToolInput } from '../tool-types';

const media: ToolDefinition = {
  name: 'media',
  description: 'Delegates media analysis to the injected media service.',
  risk: 'external',
  validate: (input: ToolInput) => { assertToolInput(input); },
  execute: async (input, context) => {
    if (context.media === undefined) return { ok: false, error: 'MEDIA_SERVICE_UNAVAILABLE' };
    return { ok: true, data: await context.media.describe(input) };
  },
};

export function registerMediaTool(): void { registerTool(media); }
export { media };
