# Nitide

Chrome extension that surfaces [Open Food Facts](https://openfoodfacts.org) scores (Nutri-Score, Green-Score, Nova) on online grocery websites. Starts with Carrefour.fr.

- Landing: <https://nitide.fr>
- Charter: [PROJECT.md](./PROJECT.md) — the source of truth for all product and technical decisions. Read it before contributing.

## Repository layout

```
nitide/
├── apps/
│   ├── web/           # Astro landing (deployed to GitHub Pages → nitide.fr)
│   └── extension/     # Chrome extension (Manifest V3, Vite + Preact + TS)
├── packages/
│   └── core/          # OFF client, shared types, product matching, cache
├── scripts/           # Repo-level scripts (icon generation, …)
└── .github/workflows/ # CI + Pages deploy
```

## Prerequisites

- Node.js **20+** (22 LTS recommended — see [`.nvmrc`](./.nvmrc))
- [pnpm](https://pnpm.io) **10+**

## Setup

```bash
pnpm install
```

## Common commands

| Command               | What it does                                               |
| --------------------- | ---------------------------------------------------------- |
| `pnpm dev`            | Runs the landing and the extension in dev mode in parallel |
| `pnpm build`          | Builds `packages/*` then `apps/*`                          |
| `pnpm test`           | Runs Vitest across every workspace that defines `test`     |
| `pnpm typecheck`      | `tsc --noEmit` across every workspace                      |
| `pnpm lint`           | ESLint (flat config) across the monorepo                   |
| `pnpm format`         | Prettier (writes changes)                                  |
| `pnpm icons:generate` | Regenerates the extension PNG icons from the SVG source    |

## Packages

- **[`apps/web`](./apps/web)** — Landing built with Astro + Tailwind, deployed to GitHub Pages.
- **[`apps/extension`](./apps/extension)** — Chrome extension. See its README for dev-mode install instructions.
- **[`packages/core`](./packages/core)** — Shared TypeScript package consumed by the extension.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). In short: feature branches, PRs must pass CI (lint + typecheck + test + build).

## Credits

Product data comes from [Open Food Facts](https://openfoodfacts.org) and is licensed under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). Nitide displays the data as-is and attributes it wherever it appears.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) © Grégoire Gutzwiller

The source is public and auditable — anyone can read it, run it locally, fork it and redistribute it for noncommercial purposes. Commercial use by third parties (reselling, integrating into a paid product, offering it as a hosted service) is not permitted without prior written agreement.
