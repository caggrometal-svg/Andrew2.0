import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/phase25-bridge-security-v2.test.mjs',
      'tests/phase25-http-e2e.test.mjs',
      'tests/phase25-http-real-e2e.test.mjs',
    ],
  },
});
