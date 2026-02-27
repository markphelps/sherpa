# Sherpa

<p align="center">
  <img src="public/sherpa.png" alt="Sherpa" width="200" />
</p>

A browser extension that guides you through pull requests with live, LLM-powered explanations as you review code. Renders a sidebar with layered progressive disclosure: PR summary, file-level explanations, and hunk-level detail.

## How it works

When you open a GitHub PR's "Files changed" tab, Sherpa:

1. **Summarizes the PR** — one LLM call using the title, description, commit messages, and file list
2. **Explains files on demand** — click or scroll to a file to get a contextual explanation using the full diff and file content
3. **Explains hunks on demand** — drill into individual code changes for line-level detail

Explanations are streamed in real time and cached locally so revisiting a PR is instant. API keys are encrypted at rest using AES-GCM and only held in memory during the active session.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed breakdown of the extension's internals.

## Security

See [SECURITY.md](SECURITY.md) for details on how Sherpa handles API keys, OAuth tokens, and other security considerations.

## Tech stack

| Layer               | Technology                                       |
| ------------------- | ------------------------------------------------ |
| Extension framework | [WXT](https://wxt.dev) (Manifest V3, Vite-based) |
| Side panel UI       | Preact + Tailwind CSS                            |
| LLM                 | Vercel AI SDK with provider adapters             |
| Backend             | Cloudflare Worker (OAuth + explanation cache)    |
| Language            | TypeScript                                       |
| Tests               | Vitest                                           |

## Setup

**For a complete step-by-step guide** covering the extension, Cloudflare Worker, GitHub App, and LLM provider setup, see **[SETUP.md](SETUP.md)**.

Quick start for development:

```bash
npm install
cp .env.example .env   # edit with your values
npm run dev            # opens Chrome with hot reload
```

| Variable                | Description                                                      | Required |
| ----------------------- | ---------------------------------------------------------------- | -------- |
| `VITE_WORKER_URL`       | Cloudflare Worker URL (or `http://localhost:8787` for local dev) | Yes      |
| `VITE_GITHUB_CLIENT_ID` | GitHub App client ID                                             | Yes      |

```bash
npm run build    # builds to .output/chrome-mv3/
npm run zip      # builds and creates a zip for distribution
npm test         # run tests
```

## Cost estimate

For a ~2400-line, 30-file PR, a full read-through costs roughly $0.10–0.30 depending on the LLM provider. Lazy loading means most reviews cost far less since you won't expand every file and hunk.

### Generated files

Generated and lock files (e.g. `package-lock.json`, `yarn.lock`, `*.min.js`) are automatically kept collapsed during scroll sync so they don't clutter the sidebar. A small "gen" badge appears next to their filename. You can still expand them manually by clicking.

Default patterns: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `*.lock`, `go.sum`, `*.min.js`, `*.min.css`, `*.generated.*`, `*.g.dart`, `*.pb.go`.

## Known limitations

- **GitHub DOM fragility** — The content script relies on GitHub's CSS class names, which are not a stable API. All selectors are isolated in `src/providers/github/selectors.ts` for easy updates when GitHub changes their markup. A validation check on load warns if expected elements aren't found.
- **Token budget** — Very large PRs with full file context can approach provider token limits. Mitigated by lazy loading at the file/hunk level rather than sending entire PRs.
- **GitHub only** — The provider abstraction (`CodeReviewProvider` + `DOMAdapter`) is designed for adding GitLab and other platforms, but only GitHub is implemented today.

## License

MIT
