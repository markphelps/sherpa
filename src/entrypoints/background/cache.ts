import type { PrContextPayload } from "@/utils/messaging";
import { CACHE_PREFIX, type CacheEntry } from "@/utils/storage";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type PrContext = PrContextPayload;

export const LockStatus = {
  ACQUIRED: "acquired",
  PENDING: "pending",
  HIT: "hit",
} as const;

export type LockStatus = (typeof LockStatus)[keyof typeof LockStatus];

export function buildCacheUrl(
  workerUrl: string,
  ctx: PrContext,
  key: string,
): string {
  const base = `${workerUrl}/cache/${ctx.owner}/${ctx.repo}/${ctx.prNumber}`;
  return `${base}/summary?key=${encodeURIComponent(key)}`;
}

export function buildMetadataUrl(
  workerUrl: string,
  ctx: PrContext,
  key: string,
): string {
  const base = `${workerUrl}/cache/${ctx.owner}/${ctx.repo}/${ctx.prNumber}`;
  return `${base}/metadata?key=${encodeURIComponent(key)}`;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_MS = 2 * 60 * 1000; // match DO pending TTL

/**
 * Check the remote cache. Returns:
 * - `{ hit: true, text }` if a ready result exists
 * - `{ hit: false, pending: true }` if another client is generating
 * - `{ hit: false, pending: false }` on a clean miss or error
 */
async function remoteGet(
  url: string,
  githubToken: string,
): Promise<{ hit: true; text: string } | { hit: false; pending: boolean }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${githubToken}` },
  });
  if (res.ok) {
    const data = (await res.json()) as { text: string };
    return { hit: true, text: data.text };
  }
  if (res.status === 202) return { hit: false, pending: true };
  if (res.status !== 404)
    console.warn("Sherpa: remote cache error", res.status);
  return { hit: false, pending: false };
}

/**
 * Poll the remote cache until the pending entry resolves or times out.
 */
async function pollForResult(
  url: string,
  githubToken: string,
): Promise<string | null> {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const result = await remoteGet(url, githubToken);
    if (result.hit) return result.text;
    if (!result.pending) return null; // lock expired or error
  }
  return null;
}

export async function getCachedExplanation(
  key: string,
  prContext: PrContext | null,
  workerUrl: string,
  githubToken: string | null,
): Promise<string | null> {
  // Try remote cache first if we have context and auth
  if (prContext && githubToken && workerUrl) {
    try {
      const url = buildCacheUrl(workerUrl, prContext, key);
      const result = await remoteGet(url, githubToken);
      if (result.hit) {
        await setLocalCachedExplanation(key, result.text);
        return result.text;
      }
    } catch (err) {
      console.warn("Sherpa: remote cache unavailable, using local", err);
    }
  }

  // Fallback to local cache
  return getLocalCachedExplanation(key);
}

/**
 * Try to acquire a generation lock for a cache key. Returns:
 * - `"acquired"` — this client should generate and PUT the result
 * - `"pending"` — another client is generating; caller should poll
 * - `"hit"` with text — result was written between our GET and POST
 * - `null` — remote unavailable, proceed without lock
 */
export async function acquireLock(
  key: string,
  prContext: PrContext | null,
  workerUrl: string,
  githubToken: string | null,
): Promise<
  | { status: typeof LockStatus.ACQUIRED }
  | { status: typeof LockStatus.PENDING }
  | { status: typeof LockStatus.HIT; text: string }
  | null
> {
  if (!prContext || !githubToken || !workerUrl) return null;
  try {
    const url = buildCacheUrl(workerUrl, prContext, key);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${githubToken}` },
    });
    if (res.status === 201) return { status: LockStatus.ACQUIRED };
    if (res.status === 409) return { status: LockStatus.PENDING };
    if (res.ok) {
      const data = (await res.json()) as { text: string };
      return { status: LockStatus.HIT, text: data.text };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Wait for a pending generation lock to resolve into a result.
 */
export async function waitForPendingResult(
  key: string,
  prContext: PrContext,
  workerUrl: string,
  githubToken: string | null,
): Promise<string | null> {
  if (!githubToken) return null;
  const url = buildCacheUrl(workerUrl, prContext, key);
  return pollForResult(url, githubToken);
}

export async function setCachedExplanation(
  key: string,
  text: string,
  prContext: PrContext | null,
  workerUrl: string,
  githubToken: string | null,
): Promise<void> {
  // Write to remote cache if available
  if (prContext && githubToken && workerUrl) {
    try {
      const url = buildCacheUrl(workerUrl, prContext, key);
      await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
    } catch (err) {
      console.warn("Sherpa: remote cache write failed, using local", err);
    }
  }

  // Always write to local cache as fallback
  await setLocalCachedExplanation(key, text);
}

// --- Local cache (unchanged logic, kept as fallback) ---

async function getLocalCachedExplanation(key: string): Promise<string | null> {
  const result = await chrome.storage.local.get(CACHE_PREFIX + key);
  const entry = result[CACHE_PREFIX + key] as CacheEntry | undefined;
  if (!entry) return null;
  if (Date.now() - entry.createdAt > MAX_AGE_MS) {
    await chrome.storage.local.remove(CACHE_PREFIX + key);
    return null;
  }
  if (!entry.text) return null;
  return entry.text;
}

export async function setLocalCachedExplanation(
  key: string,
  text: string,
): Promise<void> {
  const entry: CacheEntry = { key, text, createdAt: Date.now() };
  await chrome.storage.local.set({ [CACHE_PREFIX + key]: entry });
}
