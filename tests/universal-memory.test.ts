import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractExplicitUserName,
  forgetUserName,
  getUniversalMemory,
  isNameRecallQuery,
  isUniversalMemoryCommand,
} from '../src/core/universal-memory';

const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
});

describe('universal local memory', () => {
  it('persists an explicit user name independently of conversation ids', () => {
    expect(extractExplicitUserName('Soy Camilo. Mantenlo en tu memoria entre chat.')).toBe('Camilo');
    expect(getUniversalMemory().name).toBe('Camilo');
  });

  it('recognizes name recall queries without needing the AI provider', () => {
    expect(isNameRecallQuery('Di mi nombre')).toBe(true);
    expect(isNameRecallQuery('¿Cuál es mi nombre?')).toBe(true);
    expect(isNameRecallQuery('¿Quién soy?')).toBe(true);
  });

  it('recognizes explicit universal-memory commands', () => {
    expect(isUniversalMemoryCommand('Crea una memoria universal entre chat')).toBe(true);
    expect(isUniversalMemoryCommand('Recuérdalo')).toBe(true);
  });

  it('can forget the local identity memory', () => {
    extractExplicitUserName('Me llamo Camilo');
    expect(getUniversalMemory().name).toBe('Camilo');
    forgetUserName();
    expect(getUniversalMemory().name).toBeUndefined();
  });
});
