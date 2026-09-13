import { describe, expect, it } from 'vitest';
import { buildModelMetadata, MODEL_CONTRACT_VERSION } from './model-contract.mjs';

describe('Andrew 3.0 model metadata contract', () => {
  it('counts the canonical input payload deterministically', () => {
    const metadata = buildModelMetadata({
      model: 'gpt-5.6-luna',
      provider: 'primary',
      input: [
        { role: 'user', content: 'uno' },
        { role: 'assistant', content: [{ type: 'output_text', text: 'dos' }] },
        { role: 'user', content: 'tres' },
      ],
      outputText: 'respuesta',
    });
    expect(metadata.inputMessageCount).toBe(3);
    expect(metadata.inputRoleCounts).toEqual({ system: 0, user: 2, assistant: 1 });
    expect(metadata.outputMessageCount).toBe(1);
  });

  it('identifies the Andrew 3.0 contract version', () => {
    expect(MODEL_CONTRACT_VERSION).toBe('3.0.0');
  });

  it('does not mutate or alias the input payload', () => {
    const input = [{ role: 'user', content: 'stable' }];
    const metadata = buildModelMetadata({ model: 'gpt-5.6-luna', provider: 'primary', input, outputText: '' });
    expect(metadata.deterministicPayload).toBe(true);
    expect(input).toEqual([{ role: 'user', content: 'stable' }]);
  });
});
