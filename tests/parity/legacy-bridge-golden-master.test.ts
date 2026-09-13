import { describe, expect, it } from 'vitest';
import { normalizeLegacyBridgeAction } from '../../adapters/acl/legacy-bridge-adapter.mjs';
import { planBridgeAction } from '../../server/bridge/bridge-controller.mjs';

describe('legacy bridge golden master', () => {
  const cases = [
    'abre ajustes',
    'sincroniza ahora',
    'muéstrame el estado',
    'cambia timeoutMs a 45000',
    'configura syncEnabled a false',
  ];

  it('preserves the legacy command I/O shape through the ACL', () => {
    for (const message of cases) {
      const legacy = planBridgeAction(message);
      expect(normalizeLegacyBridgeAction(legacy)).toEqual(legacy);
    }
  });

  it('rejects malformed commands without affecting legacy behavior', () => {
    expect(normalizeLegacyBridgeAction({ command: 'unknown' })).toBeNull();
    expect(normalizeLegacyBridgeAction({ command: 'set_runtime_parameter', payload: { key: 'secret', value: 'x' } })).toBeNull();
    expect(normalizeLegacyBridgeAction({ command: 'sync_now', payload: { unexpected: true } })).toEqual({ command: 'sync_now' });
  });
});
