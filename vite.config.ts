/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  // Steam branch deploys to https://JonathanABarnett.github.io/iron-ash/next/
  // v1 (master) lives at /iron-ash/; this branch lives at /iron-ash/next/
  base: '/iron-ash/next/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: false,
    hmr: false, // disable HMR so preview screenshots don't wait on WebSocket
  },
  preview: {
    port: 5181,
    strictPort: false,
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
