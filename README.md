# Sherpa

<p align="center">
  <img src="browser/public/sherpa.png" alt="Sherpa" width="200" />
</p>

A browser extension that guides you through pull requests with live, LLM-powered explanations as you review code. Renders a sidebar with layered progressive disclosure: PR summary, file-level explanations, and hunk-level detail.

## How it works

When you open a GitHub PR's "Files changed" tab, Sherpa:

1. **Summarizes the PR** — one LLM call using the title, description, commit messages, and file list
2. **Explains files on demand** — click or scroll to a file to get a contextual explanation using the full diff and file content
3. **Explains hunks on demand** — drill into individual code changes for line-level detail

Explanations are streamed in real time and cached locally so revisiting a PR is instant. API keys are obfuscated at rest (AES-GCM-based, not true encryption) and only held in memory during the active session.

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

Requires [mise](https://mise.jdx.dev) for tool management (installs node + pnpm from `.mise.toml`). After [installing mise](https://mise.jdx.dev/getting-started.html), activate it in your shell:

```bash
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc   # or bash/fish — see mise docs
```

Quick start for development:

```bash
mise install                           # install node + pnpm (from .mise.toml)
pnpm install
cp browser/.env.example browser/.env   # edit with your values
cd browser && pnpm run dev             # opens Chrome with hot reload
```

| Variable                | Description                                                      | Required |
| ----------------------- | ---------------------------------------------------------------- | -------- |
| `VITE_WORKER_URL`       | Cloudflare Worker URL (or `http://localhost:8787` for local dev) | Yes      |
| `VITE_GITHUB_CLIENT_ID` | GitHub App client ID                                             | Yes      |

```bash
cd browser
pnpm run build    # builds to .output/chrome-mv3/
pnpm run zip      # builds and creates a zip for distribution
pnpm test         # run tests
```

## Local development (extension + worker)

To run the full stack locally you need two terminals — one for the extension and one for the Cloudflare Worker.

### 1. Extension

```bash
mise install         # install node + pnpm (one-time)
pnpm install        # from root — installs all workspace deps
cd browser
pnpm run dev
```

This starts the WXT dev server with hot reload and opens Chrome with the extension loaded. Note your extension ID from `chrome://extensions`.

### 2. Worker

```bash
cd worker
pnpm run dev   # starts wrangler dev on localhost:8787
```

Create a `worker/.dev.vars` file with your secrets:

```
GITHUB_CLIENT_ID=your_github_app_client_id
GITHUB_CLIENT_SECRET=your_github_app_client_secret
EXTENSION_ID=your_chrome_extension_id
```

Set `EXTENSION_ID` to the value from `chrome://extensions` so that CORS allows requests from your local extension.

### 3. Point the extension at the local worker

Set `VITE_WORKER_URL` in your `browser/.env` file:

```
VITE_WORKER_URL=http://localhost:8787
```

Alternatively, you can change the Worker URL in the extension's settings panel after loading it.

### 4. Tunnel for GitHub OAuth

GitHub OAuth requires a publicly reachable callback URL, so you need to tunnel your local worker. Using [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
cloudflared tunnel --url http://localhost:8787
```

Or with [ngrok](https://ngrok.com/):

```bash
ngrok http 8787
```

Then:

1. Set `VITE_WORKER_URL` in your `browser/.env` to the tunnel URL (e.g. `https://abc123.trycloudflare.com`)
2. Update your GitHub App's **Authorization callback URL** to `<tunnel-url>/callback`
3. Restart `pnpm run dev` (in `browser/`) so the extension picks up the new URL

## Cost estimate

For a ~2400-line, 30-file PR, a full read-through costs roughly $0.10–0.30 depending on the LLM provider. Lazy loading means most reviews cost far less since you won't expand every file and hunk.

## Generated files

Generated and lock files (e.g. `package-lock.json`, `yarn.lock`, `*.min.js`) are automatically kept collapsed during scroll sync so they don't clutter the sidebar. A small "gen" badge appears next to their filename. You can still expand them manually by clicking.

Default patterns:

- `package-lock.json`
- `yarn.lock`
- `pnpm-lock.yaml`
- `*.lock`
- `go.sum`
- `*.min.js`
- `*.min.css`
- `*.generated.*`
- `*.g.dart`
- `*.pb.go`

## Known limitations

- **GitHub DOM fragility** — The content script relies on GitHub's CSS class names, which are not a stable API. All selectors are isolated in `browser/src/providers/github/selectors.ts` for easy updates when GitHub changes their markup. A validation check on load warns if expected elements aren't found.
- **Token budget** — Very large PRs with full file context can approach provider token limits. Mitigated by lazy loading at the file/hunk level rather than sending entire PRs.
- **GitHub only** — The provider abstraction (`CodeReviewProvider` + `DOMAdapter`) is designed for adding GitLab and other platforms, but only GitHub is implemented today.

## License

[MIT](LICENSE)
