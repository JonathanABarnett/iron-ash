import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Engine + AI + simulation are pure: no React, no DOM, no Zustand.
  // Keeps the simulation runner cheap and the engine reusable in a worker.
  {
    files: ['src/engine/**/*.ts', 'src/ai/**/*.ts', 'src/simulation/**/*.ts'],
    languageOptions: {
      globals: {},
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Engine/AI/Simulation must stay pure (no React).' },
            { name: 'react-dom', message: 'Engine/AI/Simulation must stay pure (no DOM).' },
            { name: 'zustand', message: 'Engine/AI/Simulation must stay pure (no Zustand).' },
          ],
          patterns: [
            { group: ['@ui/*'], message: 'Engine/AI/Simulation must not depend on UI.' },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
