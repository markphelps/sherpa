# Security Model

This document describes how Sherpa handles sensitive data, authenticates users, and mitigates common browser-extension attack vectors.

## Architecture Overview

Sherpa has three execution contexts with different privilege levels:

| Context                       | Runs in             | Access to secrets     | Can modify page      |
| ----------------------------- | ------------------- | --------------------- | -------------------- |
| **Background service worker** | Extension process   | Yes (session storage) | No                   |
| **Side panel**                | Extension process   | Yes (trusted context) | No                   |
| **Content script**            | GitHub page process | No                    | Read-only DOM access |

The content script is intentionally minimal — it reads DOM structure and sends typed messages to the background worker. It never handles API keys, tokens, or LLM responses.

## Secret Storage

API keys and GitHub tokens are stored using a two-layer system:

1. **Encrypted persistence** — Secrets are encrypted with AES-GCM (256-bit key, random 12-byte IV per write) before writing to `chrome.storage.local`. The key is derived via PBKDF2 (100,000 iterations, SHA-256) from the extension ID and a per-install random salt.

2. **Session cache** — On startup, secrets are decrypted into `chrome.storage.session` (memory-only, cleared when the browser closes). Session storage is configured with `TRUSTED_CONTEXTS` access level, which makes it available to the side panel but **not** to content scripts.

The encryption is obfuscation rather than true encryption — any code running in the extension context could reproduce the key. The goal is to prevent casual inspection of secrets via DevTools or disk forensics, not to protect against a compromised extension.

## LLM API Calls

LLM requests go directly from the background service worker to provider APIs (Anthropic, OpenAI, Google). There is no proxy or intermediary server. This means:

- API keys are sent in HTTP headers directly from the user's browser
- No third-party server ever sees the keys
- The trade-off is that keys are present in browser memory during requests

## GitHub OAuth

Authentication with GitHub uses the standard OAuth 2.0 authorization code flow:

1. The extension opens GitHub's authorization page via `chrome.identity.launchWebAuthFlow`
2. GitHub redirects to the Cloudflare Worker's `/callback` endpoint with an authorization code
3. The worker exchanges the code for an access token using the OAuth client secret (stored server-side)
4. The worker redirects back to the extension's `chromiumapp.org` URL with the token

Security measures:

- **CSRF protection** — The extension encodes a random nonce and the redirect URL into the OAuth `state` parameter. The worker decodes and validates this on callback, ensuring the flow was initiated by the extension.
- **Redirect validation** — The worker validates that the redirect URL matches the `chromiumapp.org` pattern (`/^https:\/\/[a-z]{32}\.chromiumapp\.org\/?$/`) before redirecting. This prevents open-redirect attacks via the `state` parameter.
- **Server-side secret** — The OAuth client secret never leaves the worker. The extension only knows the client ID.
- **Token storage** — Access and refresh tokens are stored using the encrypted secret storage described above.

## Cloudflare Worker

The worker handles two functions: OAuth token exchange and a shared PR explanation cache.

### Cache Access Control

Every cache request is validated:

1. The GitHub Bearer token is verified against `api.github.com/user`
2. Repository access is verified against `api.github.com/repos/:owner/:repo`
3. Both checks are cached for 5 minutes (hashed token keys, bounded cache size)

Only users with read access to a repository can read or write cache entries for that repository's PRs.

### CORS

CORS headers are restricted to the Chrome extension origin. Requests from arbitrary websites are rejected.

### Input Validation

- `owner` and `repo` path segments are validated against `^[a-zA-Z0-9._-]+$`
- Cache PUT bodies are limited to 500KB
- The `/refresh` endpoint requires a valid GitHub Bearer token, preventing unauthenticated abuse

### Data Lifecycle

Cached PR explanations are automatically deleted after 7 days via Durable Object alarms. Stale locks are released after 2 minutes.

## Message Passing

All messages between extension contexts use a typed protocol defined in `src/utils/messaging.ts`:

- Messages are TypeScript discriminated unions with a `type` field and typed `payload`
- A runtime `isMessage()` validator checks that incoming messages have a known type and a non-null payload object before processing
- Unknown message types are silently ignored

## Content Security

LLM-generated markdown is rendered in the side panel with two layers of protection:

1. **HTML sanitization** — Output from the `marked` parser is sanitized with DOMPurify before rendering, stripping any `<script>`, event handlers, or other dangerous HTML
2. **MV3 default CSP** — Manifest V3 extensions block `eval()` and inline scripts by default

This prevents prompt-injection attacks where a malicious PR attempts to get the LLM to output executable HTML.

## Extension Permissions

Sherpa requests the minimum permissions needed:

| Permission                                            | Purpose                                 |
| ----------------------------------------------------- | --------------------------------------- |
| `sidePanel`                                           | Display the explanation panel           |
| `storage`                                             | Persist settings and encrypted secrets  |
| `activeTab`                                           | Access the current tab for PR detection |
| `identity`                                            | GitHub OAuth via `launchWebAuthFlow`    |
| `host_permissions` for `github.com`, `api.github.com` | Read PR data                            |
| `host_permissions` for LLM provider APIs              | Direct API calls                        |

Content scripts only run on GitHub pull request file-diff pages (`/pull/*/files`, `/pull/*/changes`).

## Reporting Vulnerabilities

If you discover a security issue, please email the maintainer directly rather than opening a public issue. We aim to respond within 48 hours.
