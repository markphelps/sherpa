# Self-Hosting Guide

Everything you need to build, deploy, and run your own instance of Sherpa from scratch.

## Overview

Sherpa has two pieces you need to set up:

1. **The Chrome extension** — built locally, loaded into your browser
2. **A Cloudflare Worker** — handles GitHub OAuth token exchange and caches PR explanations

You'll also need a **GitHub App** so the extension can authenticate with GitHub, and an **LLM API key** (Anthropic, OpenAI, or Google) so Sherpa can generate explanations.

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────┐
│   Chrome     │────▶│  Cloudflare Worker  │────▶│   GitHub     │
│  Extension   │     │  (OAuth + Cache)    │     │   API        │
└──────┬───────┘     └────────────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│  LLM Provider│  (Anthropic / OpenAI / Google)
│  (direct)    │
└──────────────┘
```

LLM calls go **directly from your browser** to the provider — no intermediary.

## Prerequisites

- **[mise](https://mise.jdx.dev)** (or Node.js 22+ and pnpm manually). After installing mise, add its shims to your PATH so tools are available in all shells:
  ```bash
  echo 'export PATH="$HOME/.local/share/mise/shims:$PATH"' >> ~/.zshrc  # or ~/.bashrc
  ```
- **A Cloudflare account** (free tier works) — [sign up](https://dash.cloudflare.com/sign-up)
- **A GitHub account**
- **A Chrome-based browser** (Chrome, Brave, Arc, Edge, etc.)
- **An LLM API key** from at least one provider:
  - [Anthropic](https://console.anthropic.com/) (recommended)
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Google AI Studio](https://ai.google.dev/)

---

## Step 1: Clone and Install

```bash
git clone https://github.com/markphelps/sherpa.git
cd sherpa
mise install      # install node + pnpm (from .mise.toml)
pnpm install
```

Install the worker dependencies too:

```bash
cd worker
pnpm install
cd ..
```

---

## Step 2: Create a GitHub App

Sherpa uses a GitHub App (not an OAuth App) for fine-grained permissions.

1. Go to [GitHub Developer Settings → GitHub Apps](https://github.com/settings/apps)
2. Click **"New GitHub App"**
3. Fill in the basic info:

| Field               | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| **GitHub App name** | `Sherpa` (must be globally unique — try `sherpa-yourname`)   |
| **Homepage URL**    | `https://github.com/markphelps/sherpa`                       |
| **Callback URL**    | `https://your-worker-name.your-account.workers.dev/callback` |

> You'll get the real worker URL in Step 4. You can come back and update the callback URL after deploying.

4. Under **Permissions → Repository permissions**, set:

| Permission        | Access    |
| ----------------- | --------- |
| **Contents**      | Read-only |
| **Pull requests** | Read-only |

Leave all other permissions as "No access".

5. Under **"Where can this GitHub App be installed?"**, select **"Any account"** (so you can use it on repos you don't own but have access to)
6. Click **"Create GitHub App"**
7. Copy the **Client ID** — you'll need it shortly
8. Click **"Generate a new client secret"** and copy it — you'll need it for the worker

---

## Step 3: Configure the Extension

Create a `.env` file in the `browser/` directory:

```bash
cp browser/.env.example browser/.env
```

Edit `browser/.env` with your values:

```bash
# Your Cloudflare Worker URL (from Step 4)
VITE_WORKER_URL=https://sherpa-worker.your-account.workers.dev

# Your GitHub App Client ID (from Step 2)
VITE_GITHUB_CLIENT_ID=Iv23li...
```

> If you haven't deployed the worker yet, use a placeholder for `VITE_WORKER_URL` — you can rebuild after Step 4.

---

## Step 4: Deploy the Cloudflare Worker

### 4a. Log in to Cloudflare

```bash
cd worker
npx wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

### 4b. Set secrets

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put EXTENSION_ID
```

- **GITHUB_CLIENT_ID** — Client ID from your GitHub App (Step 2)
- **GITHUB_CLIENT_SECRET** — Client secret from your GitHub App (Step 2)
- **EXTENSION_ID** — Your Chrome extension ID from `chrome://extensions/` (the long string under the extension name, e.g. `efnjebpbmhcdakhgbbgnmaegeamimaan`). You can load the extension first (Step 5) and come back to set this.

> **Tip**: For local development, you can also put these in `worker/.dev.vars` (one `KEY=value` per line). This file is gitignored.

### 4c. Deploy

```bash
pnpm run deploy
```

The output will show your worker URL, something like:

```
Published sherpa-worker (1.2s)
  https://sherpa-worker.your-account.workers.dev
```

### 4d. Update callback URL

Go back to your [GitHub App settings](https://github.com/settings/apps) and update the **Callback URL** to:

```
https://sherpa-worker.your-account.workers.dev/callback
```

### 4e. Update .env

If you used a placeholder in Step 3, update `VITE_WORKER_URL` in your `browser/.env` with the real worker URL and rebuild:

```bash
cd ../browser
pnpm run build
```

---

## Step 5: Build and Install the Extension

### Build

```bash
cd browser
pnpm run build
```

This outputs a production build to `browser/.output/chrome-mv3/`.

### Load in Chrome

1. Open `chrome://extensions/` in your browser
2. Enable **"Developer mode"** (toggle in the top right)
3. Click **"Load unpacked"**
4. Select the `browser/.output/chrome-mv3/` directory

The Sherpa icon should appear in your toolbar.

> **Note**: After rebuilding, you need to click the refresh icon on the extension card at `chrome://extensions/` to pick up changes.

---

## Step 6: Configure Sherpa

1. Navigate to any GitHub PR's **"Files changed"** tab
2. Click the **Sherpa icon** in the toolbar to open the side panel
3. Click the **gear icon** to open Settings

### LLM Provider

Choose your provider and enter your API key:

| Provider  | Recommended model          | Get an API key                                              |
| --------- | -------------------------- | ----------------------------------------------------------- |
| Anthropic | `claude-sonnet-4-20250514` | [console.anthropic.com](https://console.anthropic.com/)     |
| Google    | `gemini-2.5-flash-lite`    | [ai.google.dev](https://ai.google.dev/)                     |
| OpenAI    | `gpt-4o`                   | [platform.openai.com](https://platform.openai.com/api-keys) |

Sherpa validates your key when you enter it and shows a green checkmark if it works.

### GitHub Authentication

Click **"Sign in with GitHub"** in the settings panel. This will open a popup to authorize the GitHub App you created in Step 2.

Once authorized, your GitHub status will show as connected.

### Worker URL

If your worker URL isn't pre-filled (from the build-time `.env`), enter it in the **API** section of settings.

---

## Step 7: Test It

1. Open a GitHub PR → **"Files changed"** tab
2. Open the Sherpa side panel
3. You should see a PR summary start streaming
4. Scroll through files to see file-level and hunk-level explanations

---

## Troubleshooting

### "Auth required" error

- Make sure you've signed in with GitHub in the settings panel
- Check that your GitHub App's callback URL matches your worker URL exactly: `https://your-worker.workers.dev/callback`
- Check that the `EXTENSION_ID` secret matches your actual extension ID from `chrome://extensions/`

### OAuth popup closes immediately

- The `GITHUB_CLIENT_ID` in your `.env` must match the one set as a wrangler secret
- Make sure all three worker secrets are set (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `EXTENSION_ID`)

### "Could not access this repository"

- The Sherpa GitHub App needs to be **installed** on the organization or account that owns the repo
- Go to [GitHub App installations](https://github.com/settings/installations), find Sherpa, and grant access to the relevant org or repos
- After granting access, click "Try again" in the extension

### Explanations not loading

- Check the browser console (right-click the side panel → Inspect) for errors
- Verify your LLM API key is valid (the settings panel shows validation status)
- Make sure you're on a PR's "Files changed" tab, not the conversation tab

### Worker errors

Check your worker logs:

```bash
cd worker
npx wrangler tail
```

### Extension not detecting PRs

- Sherpa only activates on `github.com/*/pull/*/files` and `github.com/*/pull/*/changes` URLs
- Try refreshing the page
- Check `chrome://extensions/` for any error badges on the extension

---

## Development

For local development with hot reload:

```bash
cd browser
pnpm run dev
```

WXT opens Chrome with the extension loaded and watches for file changes.

To run the worker locally:

```bash
cd worker
pnpm run dev
```

Then set `VITE_WORKER_URL=http://localhost:8787` in your `browser/.env`.

---

## Updating

To update to the latest version:

```bash
git pull
mise install      # pick up any tool version changes
pnpm install
cd browser && pnpm run build
```

Then refresh the extension at `chrome://extensions/`.

If the worker code changed:

```bash
cd worker
pnpm install
pnpm run deploy
```

---

## Cost Estimate

LLM costs depend on usage. For a typical ~2400-line, 30-file PR, a full read-through costs roughly **$0.10–0.30** depending on the provider. In practice, most reviews cost far less since Sherpa lazy-loads explanations — you only pay for what you expand.

Cloudflare Workers free tier includes 100,000 requests/day and Durable Objects storage, which is more than enough for personal use.
