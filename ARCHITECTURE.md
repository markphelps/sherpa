# Architecture

Sherpa is a Chrome extension (Manifest V3) that provides LLM-powered explanations in a sidebar while reviewing GitHub pull requests. It is built with [WXT](https://wxt.dev), [Preact](https://preactjs.com), [Tailwind CSS v4](https://tailwindcss.com), and the [Vercel AI SDK](https://sdk.vercel.ai).

## High-level overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│                                                                      │
│  ┌──────────────┐    messages     ┌───────────────────────────┐      │
│  │Content Script │───────────────▶│  Background Service Worker │      │
│  │(github.com)   │                │                           │      │
│  │               │                │  • Message routing         │      │
│  │  • PR detect  │                │  • In-memory PR cache      │      │
│  │  • DOM observe│                │  • LLM streaming           │      │
│  │  • Scroll sync│                │  • Cache management        │      │
│  └──────────────┘                └──┬──────┬──────┬──────────┘      │
│                                     │      │      │      │           │
│                              messages│  HTTP│  HTTP│  HTTP│           │
│                                     │      │      │      │           │
│  ┌──────────────┐                   │      │      │      │           │
│  │  Side Panel   │◀─────────────────┘      │      │      │           │
│  │  (Preact UI)  │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│      │      │           │
│  │               │  messages (requests)    │      │      │           │
│  │  • PR summary │                         │      │      │           │
│  │  • File cards │                         │      │      │           │
│  │  • Hunk detail│                         │      │      │           │
│  │  • Settings   │                         │      │      │           │
│  └──────────────┘                         │      │      │           │
│                                            │      │      │           │
└────────────────────────────────────────────┼──────┼──────┼───────────┘
                                             │      │      │
                           ┌─────────────────┘      │      └──────────┐
                           ▼                        ▼                 ▼
                 ┌──────────────────┐  ┌────────────────┐  ┌─────────────────┐
                 │  LLM Providers   │  │  GitHub API     │  │ Cloudflare      │
                 │  (direct calls)  │  │                 │  │ Worker          │
                 │                  │  │  • PR metadata  │  │                 │
                 │  • Anthropic     │  │  • Commits      │  │ • OAuth token   │
                 │  • OpenAI        │  │  • File diffs   │  │   exchange      │
                 │  • Google        │  │  • File content │  │ • PR cache      │
                 └──────────────────┘  └────────────────┘  │   (Durable      │
                                                           │    Objects)     │
                                                           └─────────────────┘
```

## Three entrypoints

### Content script

Runs on GitHub PR file-diff pages. Detects the PR from the URL, observes diff hunks with an `IntersectionObserver` for scroll sync, and handles GitHub's SPA navigation (`turbo:load`, `popstate`).

### Background service worker

The central hub. Routes all messages, fetches PR data from GitHub (cached in-memory), streams LLM explanations, and manages the dual-layer cache. Deduplicates in-flight LLM calls and pre-fetches adjacent hunks in the background.

### Side panel

A Preact single-page app in Chrome's side panel. Displays the PR summary, per-file explanations, and hunk-level detail. Streams LLM responses incrementally and auto-expands files as the user scrolls through the diff.

## Data flows

### Explanation flow

1. Content script detects a PR URL → sends `PR_CONTEXT` to background.
2. Background forwards context to side panel → side panel fires `EXPLAIN_PR`.
3. Background checks auth, fetches the PR from GitHub, sends `PR_DATA` with the file list.
4. Background checks remote cache → local cache → calls LLM if miss.
5. LLM response streams as `EXPLANATION_RESULT` chunks → side panel renders incrementally.
6. Final result is written to both remote and local cache.

### Scroll sync flow

1. Content script's `IntersectionObserver` fires as hunks enter/leave viewport.
2. Sends `VISIBLE_HUNKS` → background relays to side panel.
3. Side panel auto-expands the corresponding file card.

### OAuth flow

1. User clicks sign in → background opens `chrome.identity.launchWebAuthFlow()`.
2. GitHub redirects to the Cloudflare Worker's `/callback` with an authorization code.
3. Worker exchanges code for access token using the client secret.
4. Worker 302-redirects back to the extension with the token as a query parameter.
5. Background saves the token securely (see Secret storage below).

## Secret storage

API keys and tokens are encrypted at rest using AES-GCM (Web Crypto API) with a key derived via PBKDF2. Encrypted values are persisted in `chrome.storage.local` with an `_enc:` prefix. On extension startup, secrets are decrypted into `chrome.storage.session` (memory-only, cleared when the extension unloads) so runtime reads are fast and plaintext never hits disk after initial setup.

## Message types

All communication between extension contexts uses `chrome.runtime.sendMessage` with typed messages.

| Message              | Direction                         | Purpose                               |
| -------------------- | --------------------------------- | ------------------------------------- |
| `PR_CONTEXT`         | Content → Background → Side Panel | PR detected on page                   |
| `SIDE_PANEL_READY`   | Side Panel → Background           | Panel opened; triggers context replay |
| `DETECT_PR`          | Side Panel → Background           | Manual "evaluate this PR"             |
| `EXPLAIN_PR`         | Side Panel → Background           | Request PR summary                    |
| `EXPLAIN_FILE`       | Side Panel → Background           | Request file explanation              |
| `EXPLAIN_HUNK`       | Side Panel → Background           | Request hunk explanation              |
| `PR_DATA`            | Background → Side Panel           | File list and head SHA                |
| `EXPLANATION_RESULT` | Background → Side Panel           | Streaming or final explanation text   |
| `VISIBLE_HUNKS`      | Content → Background → Side Panel | Currently visible diff hunks          |
| `ERROR`              | Background → Side Panel           | Typed error (auth/access/network/api) |
| `AUTH_REQUIRED`      | Background → Side Panel           | GitHub auth needed                    |

## Caching

Dual-layer caching avoids redundant LLM calls. Cache keys include the commit SHA and detail level so changing either produces a miss rather than a stale result.

- **Remote cache (primary)** — Cloudflare Worker with Durable Objects. One instance per PR with SQLite-backed storage and 7-day lazy TTL eviction. All requests are authenticated against GitHub.
- **In-memory PR cache** — Background worker keeps fetched PR data (metadata, commits, files) in a `Map` so subsequent file/hunk explanations don't re-fetch from GitHub.
- **Local cache (fallback)** — `chrome.storage.local` with a 7-day TTL. Remote hits are backfilled locally. New LLM results are written to both layers.

## LLM integration

Wraps the Vercel AI SDK's `streamText()` for three providers (Anthropic, OpenAI, Google). API calls go **directly from the browser** to the provider — there is no proxy. The user configures their own API key in the settings panel. Available models are fetched from the provider's API after the key is validated — there are no hardcoded model lists.

Prompt templates accept a detail level (`concise`, `balanced`, or `detailed`) and produce system + user message pairs tailored for PR summaries, file explanations, or hunk explanations.

## Cloudflare Worker

A standalone project handling two responsibilities:

- **OAuth token exchange** — Bridges GitHub's OAuth code grant with the Chrome extension's `chrome.identity` flow.
- **PR explanation cache** — Routes to Durable Objects. Each PR gets its own instance with SQLite storage and lazy 7-day TTL eviction.

All cache routes require a valid GitHub Bearer token. The worker validates the token and confirms repo access before serving data.

## Platform abstraction

The provider layer defines platform-agnostic interfaces (`CodeReviewProvider` for API calls, `DOMAdapter` for DOM interaction) so the extension could support GitLab or other platforms in the future. Only GitHub is implemented today.

## Tech stack

| Layer               | Technology                                            |
| ------------------- | ----------------------------------------------------- |
| Extension framework | WXT (Manifest V3, Vite-based)                         |
| UI                  | Preact (aliased as React, ~3KB), Tailwind CSS v4      |
| LLM                 | Vercel AI SDK with Anthropic, OpenAI, Google adapters |
| Icons               | Hugeicons Pro                                         |
| Backend             | Cloudflare Worker with Durable Objects (SQLite)       |
| Testing             | Vitest                                                |
| Language            | TypeScript                                            |
