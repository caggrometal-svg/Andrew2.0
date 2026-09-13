import { describe, expect, it } from 'vitest';
import { authorize, requireAuthorization } from '../core/authorization';
import { defaultPermissions, isAllowed, validatePermissionState } from '../core/permissions';
import { getMemories, saveMemory, updateMemory } from '../core/memory';
import { learnFromOutcome } from '../core/learning';

const allowedMemory = [{ permission: 'memory.write' as const, granted: true, reason: 'test' }];
const allowedLearning = [
  { permission: 'memory.write' as const, granted: true, reason: 'test' },
  { permission: 'analysis.run' as const, granted: true, reason: 'test' },
];

describe('core security invariants', () => {
  it('fails closed for an unknown permission state', () => {
    expect(isAllowed('memory.write', [])).toBe(false);
    expect(authorize('memory.write', [])).toEqual({ allowed: false, permission: 'memory.write', reason: 'Permission denied: memory.write' });
  });

  it('rejects duplicate permission entries', () => {
    expect(() => validatePermissionState([
      { permission: 'memory.write', granted: true, reason: 'a' },
      { permission: 'memory.write', granted: false, reason: 'b' },
    ])).toThrow('Duplicate permission');
  });

  it('rejects unauthorized memory mutation before storage changes', () => {
    expect(() => saveMemory('secret', [], [])).toThrow('Permission denied: memory.write');
    expect(getMemories()).toEqual([]);
  });

  it('propagates the same authorization context into learning memory writes', () => {
    const record = learnFromOutcome({ projectId: 'p', question: 'q', observation: 'o', outcome: 'ok', lesson: 'l', confidence: 0.8 }, allowedLearning);
    expect(record.confidence).toBe(0.8);
    expect(getMemories().some((memory) => memory.tags.includes('learning'))).toBe(true);
  });

  it('does not permit a duplicate deny to be bypassed by allow', () => {
    expect(isAllowed('memory.write', [
      { permission: 'memory.write', granted: true, reason: 'allow' },
      { permission: 'memory.write', granted: false, reason: 'deny' },
    ])).toBe(false);
  });

  it('preserves explicit authorization for normal memory updates', () => {
    const item = saveMemory('before', [], allowedMemory);
    const updated = updateMemory(item.id, 'after', undefined, allowedMemory);
    expect(updated.text).toBe('after');
  });

  it('keeps the default permission contract valid', () => {
    expect(() => validatePermissionState(defaultPermissions)).not.toThrow();
    expect(() => requireAuthorization('memory.write', defaultPermissions)).not.toThrow();
  });
});
