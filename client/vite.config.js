import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api and /ws to the Node backend on :3141. The production
// build (dist/) is static-served by that same Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3141',
      '/ws': { target: 'ws://localhost:3141', ws: true },
    },
  },
  build: { outDir: 'dist' },
  // Vitest: pure-logic + SSR-render tests, no browser. `css: false` no-ops the
  // highlight.js theme import in MarkdownRenderer so component tests don't choke.
  test: {
    environment: 'node',
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
  },
});
