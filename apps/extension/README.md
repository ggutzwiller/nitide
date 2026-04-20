# @nitide/extension

Nitide Chrome extension. Manifest V3, built with [Vite](https://vitejs.dev) + [Preact](https://preactjs.com) + [`@crxjs/vite-plugin`](https://crxjs.dev).

## Scripts

```bash
pnpm --filter @nitide/extension dev        # Vite dev server with HMR
pnpm --filter @nitide/extension build      # Production build → ./dist
pnpm --filter @nitide/extension typecheck  # tsc --noEmit
pnpm --filter @nitide/extension test       # Vitest
```

## Loading the extension in dev mode

1. Run `pnpm --filter @nitide/extension dev` (or `pnpm dev` from the repo root).
2. Open `chrome://extensions` in a Chromium-based browser.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select `apps/extension/dist`.
5. Visit <https://www.carrefour.fr>. Open DevTools → Console — you should see `[Nitide] activé sur Carrefour`.

HMR is active: saving a source file reloads the affected part of the extension automatically. On manifest or permission changes, reload the extension from `chrome://extensions`.

## Building for distribution

```bash
pnpm --filter @nitide/extension build
```

The output lands in `apps/extension/dist/`. For Chrome Web Store submission, zip that directory.

## Icons

Extension icons are regenerated from [`../../packages/core`](../../packages/core) sources via the repo-level script:

```bash
pnpm icons:generate
```

Outputs live at `apps/extension/public/icons/icon-{16,32,48,128}.png` and are committed to the repo so the extension builds without first running the script.
