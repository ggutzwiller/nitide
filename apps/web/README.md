# @nitide/web

Landing page for Nitide. Built with [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com), deployed to GitHub Pages on [nitide.fr](https://nitide.fr).

## Scripts

```bash
pnpm --filter @nitide/web dev        # astro dev on http://localhost:4321
pnpm --filter @nitide/web build      # static build → ./dist
pnpm --filter @nitide/web preview    # preview the production build
pnpm --filter @nitide/web typecheck  # astro check
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-web.yml`, which builds the site and publishes `apps/web/dist` to GitHub Pages. A `CNAME` file in `public/` wires the custom domain `nitide.fr`.

## Design tokens

Design tokens are declared in [`tailwind.config.js`](./tailwind.config.js):

| Token         | Value     | Role                       |
| ------------- | --------- | -------------------------- |
| `green-dark`  | `#1F3D2B` | Primary text and accents   |
| `green-sage`  | `#7A9E7E` | Calm secondary elements    |
| `amber-ocre`  | `#D4A24C` | Warm accent, CTA highlight |
| `cream`       | `#FAF6EE` | Page background            |
| `ink`         | `#1A1A1A` | Body text                  |
| `ink-muted`   | `#5C5C5C` | Secondary text             |
| `border-soft` | `#E5E1D6` | Soft borders               |

Fonts (Google Fonts): **Instrument Serif** for headings, **Geist** for body, **Geist Mono** if needed.
