import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
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
