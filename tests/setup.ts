import "@testing-library/jest-dom/vitest";

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => `test-${Math.random().toString(36).slice(2)}`,
  });
}
