import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
      "@editor": path.resolve(process.cwd(), "./src/editor"),
      "@network": path.resolve(process.cwd(), "./src/network"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
  },
});
