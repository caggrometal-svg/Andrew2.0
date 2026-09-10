import { describe, expect, it } from 'vitest';
import { PHASE4_REQUIRED_CHECKS } from '../server/tools/phase4-contract';

describe('Phase 4 release contract', () => {
  it('PHASE_4_REQUIRED_CHECKS', () => {
    expect(PHASE4_REQUIRED_CHECKS).toHaveLength(12);
    expect(PHASE4_REQUIRED_CHECKS).toContain('TOOL_REGISTRATION');
    expect(PHASE4_REQUIRED_CHECKS).toContain('PHASE_2_REGRESSION');
    expect(PHASE4_REQUIRED_CHECKS).toContain('PHASE_3_REGRESSION');
    expect(PHASE4_REQUIRED_CHECKS).toContain('FULL_REGRESSION');
  });
});
