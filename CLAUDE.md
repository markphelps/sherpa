# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## What is Sherpa

A Chrome extension (Manifest V3) that provides LLM-powered explanations in a sidebar while reviewing GitHub pull requests. Built with WXT, Preact, Tailwind CSS v4, and Vercel AI SDK.

## Commands

```bash
# From root — shared tooling
mise install             # Install node + pnpm (from .mise.toml)
pnpm install             # Install all workspace dependencies
pnpm run lint            # Biome check across all packages
pnpm run format          # Biome + Prettier formatting
pnpm test                # Run tests across all packages

# Browser extension (from browser/)
cd browser
pnpm run dev             # Start dev server with hot reload
pnpm run build           # Build to .output/chrome-mv3/
pnpm run zip             # Build + create distributable zip
pnpm test                # Run extension tests (vitest)
pnpm exec vitest run src/path/to/file.test.ts  # Run a single test file

# Worker (from worker/)
cd worker
pnpm run dev             # Start wrangler dev server
pnpm run deploy          # Deploy to Cloudflare
```

This is a **pnpm monorepo** with two packages:

- `browser/` — the Chrome extension
- `worker/` — Cloudflare Worker (OAuth token exchange + PR cache)

Shared tooling (biome, prettier, husky) lives at the root. Tool versions (node, pnpm) are pinned in `.mise.toml` and managed by [mise](https://mise.jdx.dev).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation. Key points for development:

- Three entrypoints (content script, side panel, background worker) communicate via typed messages in `browser/src/utils/messaging.ts`.
- Preact is aliased to React in `browser/wxt.config.ts` — use React import syntax.
- All GitHub CSS selectors are isolated in `browser/src/providers/github/selectors.ts` — update there when GitHub changes DOM structure.
- LLM calls go directly from the browser to providers (no proxy). Configured in `browser/src/entrypoints/background/llm.ts`.
- Generated/lock file detection lives in `browser/src/utils/generated-files.ts` — controls auto-collapse during scroll sync.
- The `worker/` directory is a separate Cloudflare Worker handling OAuth token exchange and a Durable Objects PR cache.

## Issue Tracking

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
```

## Session Completion

**When ending a work session**, complete ALL steps below. Work is NOT complete until `git push` succeeds.

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE**:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
