# Contributing to Nitide

Thanks for taking the time to look at the project. This document summarises the conventions we use.

## Getting started

```bash
pnpm install
pnpm dev
```

Everything else lives in the root [README](./README.md).

## Branches

- `main` is protected. Work on feature branches named `feat/<short-topic>`, `fix/<short-topic>`, or `chore/<short-topic>`.
- Open a pull request against `main`. CI must be green (lint + typecheck + test + build) before merge.

## Code style

- TypeScript strict mode across the codebase — no implicit `any`, no unused locals.
- Prettier formats everything (`pnpm format`).
- ESLint guards the code (`pnpm lint`).

## Pull requests

- One concern per PR.
- Describe the change and link any relevant issue.
- Split multi-step work into multiple small PRs when possible.
- Update [PROJECT.md](./PROJECT.md) if you change a product or technical decision.
