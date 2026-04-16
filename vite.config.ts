import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Production builds ship under `/flux-sandbox/` on GitHub Pages.
 * Dev server stays at `/` for convenience.
 * Override with `BASE_PATH=/custom/` for other hosts.
 */
export default defineConfig(({ command }) => ({
  plugins: [tailwindcss()],
  base:
    process.env.BASE_PATH ??
    (command === 'build' ? '/flux-sandbox/' : '/'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
}));
