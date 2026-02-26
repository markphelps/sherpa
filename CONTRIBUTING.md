# Contributing

Thanks for your interest in contributing to Sherpa! Here's what you need to know.

## Getting started

```bash
git clone https://github.com/markphelps/sherpa.git
cd sherpa
npm install
cp .env.example .env   # edit with your values
npm run dev            # opens Chrome with hot reload
```

See [SETUP.md](SETUP.md) for detailed setup including the Cloudflare Worker, GitHub App, and LLM provider configuration.

For local development without deploying the worker, you can run it locally:

```bash
cd worker && npm install && npx wrangler dev
```

Then set `VITE_WORKER_URL=http://localhost:8787` in your `.env`.

## Code style

- **Linting and formatting**: [Biome](https://biomejs.dev/) handles both. A pre-commit hook runs automatically via Husky.
- **Markdown formatting**: Prettier is used for `.md` files only.
- Run `npm run lint` to check and `npm run lint:fix` to auto-fix.

## Running tests

```bash
npm test                                    # all tests
npx vitest run src/path/to/file.test.ts     # single file
```

## Submitting changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `npm run lint` and `npm test` pass
4. Open a pull request with a clear description of what changed and why

## Project structure

- `src/` — Extension source (content script, side panel, background worker)
- `worker/` — Cloudflare Worker (separate project with its own `package.json`)
- See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed internals
