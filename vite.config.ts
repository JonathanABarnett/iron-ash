/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: false, // fall back to next free port if 5180 is taken
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@ai': path.resolve(__dirname, 'src/ai'),
      '@simulation': path.resolve(__dirname, 'src/simulation'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@config': path.resolve(__dirname, 'config'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
