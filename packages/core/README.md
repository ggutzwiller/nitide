# @nitide/core

Shared TypeScript package for Nitide. Holds:

- **Types** (`./types`) — `Product`, `NutriScore`, `GreenScore`, `NovaGroup`, `OFFResponse`, `DomProduct`.
- **OFF client** (`./off-client`) — `fetchByBarcode`, `searchByText` (stubs, M2).
- **Cache** (`./cache`) — TTL cache over `chrome.storage.local` (stub, M2).
- **Matching** (`./matching`) — resolves a DOM-extracted product to an OFF product (stub, M3).

Consumed by `apps/extension` via the workspace protocol. No runtime dependencies.

## Scripts

```bash
pnpm --filter @nitide/core test       # Vitest
pnpm --filter @nitide/core typecheck  # tsc --noEmit
```
