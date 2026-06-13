import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // No sourcemaps in the distributed build: keeps the store zip lean and
    // avoids shipping .map files via web_accessible_resources.
    sourcemap: false,
  },
  server: {
    // Keep CRXJS's HMR websocket on a fixed port during dev.
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5174,
    },
  },
});
