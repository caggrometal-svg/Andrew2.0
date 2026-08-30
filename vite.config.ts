import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@storage': path.resolve(__dirname, './src/storage'),
      '@permissions': path.resolve(__dirname, './src/permissions'),
      '@activity': path.resolve(__dirname, './src/activity'),
      '@memory': path.resolve(__dirname, './src/memory'),
      '@planner': path.resolve(__dirname, './src/planner'),
      '@analysis': path.resolve(__dirname, './src/analysis'),
      '@projects': path.resolve(__dirname, './src/projects'),
      '@state': path.resolve(__dirname, './src/state'),
      '@assistant': path.resolve(__dirname, './src/assistant'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@network': path.resolve(__dirname, './src/network'),
    },
  },
  server: { port: 5173, open: false },
  build: { outDir: 'dist', sourcemap: false, minify: 'terser' },
});
