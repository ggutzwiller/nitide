import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Custom domain (nitide.fr) will be served from the repo root once the CNAME
// lands in GitHub Pages, so `base` stays at '/'.
export default defineConfig({
  site: 'https://nitide.fr',
  base: '/',
  trailingSlash: 'ignore',
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
  ],
});
