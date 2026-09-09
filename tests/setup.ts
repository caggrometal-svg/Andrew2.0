import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => `test-${Math.random().toString(36).slice(2)}`,
  });
}

if (typeof window !== "undefined") {
  window.URL.revokeObjectURL = vi.fn();
  window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
}
