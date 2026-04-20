# @nitide/core

Shared TypeScript package for Nitide. Pure TypeScript, no runtime dependencies.

## What it exports

| Export | Origin | Role |
| --- | --- | --- |
| `NutriScore`, `GreenScore`, `NovaGroup`, `Product`, `MatchInput`, OFF response types | `./types` | Shared type surface |
| `createOffClient`, `parseProduct`, `OFF_BASE_URL`, `DEFAULT_TIMEOUT_MS`, `USER_AGENT` | `./off-client` | OFF v2 client: `fetchByBarcode`, `searchByText`. Injectable `fetch`. Never throws — all failures map to `null` |
| `TtlCache`, `AsyncKeyValueStorage`, `createMemoryStorage`, `createChromeLocalStorage`, `DEFAULT_POSITIVE_TTL_MS`, `DEFAULT_NULL_TTL_MS` | `./cache` | TTL cache over a pluggable async key-value store |
| `matchProduct`, `buildCacheKey`, `normalizeTextKey`, `MatchDeps` | `./matching` | Cache-aware EAN-then-text resolver |

## Design decisions

- **Score grades in lowercase** (`'a' | 'b' | 'c' | 'd' | 'e'`) — matches the raw OFF payload; UI layers uppercase for display.
- **Green-Score field** — reads `environmental_score_grade` first (new name since 2024), falls back to legacy `ecoscore_grade`.
- **Error policy in the client** — timeouts, network errors, 4xx, 5xx, and `status: 0` all become `null`. No exception crosses the API boundary.
- **Cache distinguishes miss vs. cached null** — `TtlCache.get` returns `{ value } | null`. `matching` uses this to remember "product not found" lookups (TTL 24 h) alongside positive hits (TTL 30 d).
- **No `@types/chrome` dependency** — `createChromeLocalStorage` declares the minimal shape it needs; core stays importable from plain Node.

## Scripts

```bash
pnpm --filter @nitide/core test           # Vitest (43 tests)
pnpm --filter @nitide/core test:coverage  # Same + v8 coverage report (thresholds: 80 / 75)
pnpm --filter @nitide/core typecheck      # tsc --noEmit
```
