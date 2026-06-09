import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Nitide',
  description:
    'Affiche les scores Open Food Facts (Nutri-Score, Green-Score, Nova) sur les sites de courses en ligne.',
  version: pkg.version,
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/carrefour/index.ts'],
      matches: ['https://www.carrefour.fr/*'],
      run_at: 'document_idle',
    },
    {
      js: ['src/content/intermarche/index.ts'],
      matches: ['https://www.intermarche.com/*'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage'],
  host_permissions: [
    'https://www.carrefour.fr/*',
    'https://www.intermarche.com/*',
    'https://world.openfoodfacts.org/*',
  ],
});
