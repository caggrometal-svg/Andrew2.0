import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

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
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    reporters: process.env.GITHUB_ACTIONS === 'true' ? ['default', 'github-actions'] : ['default'],
  },
});
