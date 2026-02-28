# Contributing

Thanks for your interest in contributing to Sherpa! Here's what you need to know.

## Getting started

```bash
git clone https://github.com/markphelps/sherpa.git
cd sherpa
mise install                           # install node + pnpm (from .mise.toml)
pnpm install
cp browser/.env.example browser/.env   # edit with your values
cd browser && pnpm run dev             # opens Chrome with hot reload
```

See [SETUP.md](SETUP.md) for detailed setup including the Cloudflare Worker, GitHub App, and LLM provider configuration.

For local development without deploying the worker, you can run it locally:

```bash
cd worker && pnpm run dev
```

Then set `VITE_WORKER_URL=http://localhost:8787` in your `browser/.env`.

## Code style

- **Linting and formatting**: [Biome](https://biomejs.dev/) handles both. A pre-commit hook runs automatically via Husky.
- **Markdown formatting**: Prettier is used for `.md` files only.
- Run `pnpm run lint` from the root to check and `pnpm run lint:fix` to auto-fix.

## Running tests

```bash
pnpm test                                              # all tests (across workspace)
cd browser && pnpm exec vitest run src/path/to/file.test.ts  # single file
```

## Submitting changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `pnpm run lint` and `pnpm test` pass
4. Open a pull request with a clear description of what changed and why

## Project structure

- `browser/` — Chrome extension source (content script, side panel, background worker)
- `worker/` — Cloudflare Worker (separate package with its own `package.json`)
- See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed internals
