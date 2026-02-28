/**
 * Secure secret storage with encrypted persistence and session cache.
 *
 * Secrets are encrypted with AES-GCM before writing to chrome.storage.local
 * and cached in chrome.storage.session (memory-only) for runtime reads.
 * On startup, initSecureStorage() decrypts persisted secrets into the
 * session cache so they are immediately available.
 */

import { decrypt, encrypt } from "./crypto";

export const SECRET_LLM_API_KEY = "llmApiKey" as const;
export const SECRET_GITHUB_TOKEN = "githubToken" as const;
export const SECRET_GITHUB_REFRESH_TOKEN = "githubRefreshToken" as const;

export interface SecretStore {
  [SECRET_LLM_API_KEY]: string;
  [SECRET_GITHUB_TOKEN]: string | null;
  [SECRET_GITHUB_REFRESH_TOKEN]: string | null;
}

const ALL_SECRET_KEYS: (keyof SecretStore)[] = [
  SECRET_LLM_API_KEY,
  SECRET_GITHUB_TOKEN,
  SECRET_GITHUB_REFRESH_TOKEN,
];

const SECRET_PREFIX = "_enc:";

export async function initSecureStorage(): Promise<void> {
  // Session storage is only visible to the service worker by default.
  // TRUSTED_CONTEXTS exposes it to the side panel and popup (but not content scripts).
  await chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  await hydrateSessionFromLocal();
}

async function hydrateSessionFromLocal(): Promise<void> {
  const keys = ALL_SECRET_KEYS;
  const storageKeys = keys.map((k) => `${SECRET_PREFIX}${k}`);
  const result = await chrome.storage.local.get(storageKeys);
  for (const key of keys) {
    const encrypted = result[`${SECRET_PREFIX}${key}`];
    if (encrypted) {
      try {
        const value = await decrypt(encrypted);
        await chrome.storage.session.set({ [`secret:${key}`]: value });
      } catch {
        // Decryption failed (salt changed, corrupt data) -- clear it
        await chrome.storage.local.remove(`${SECRET_PREFIX}${key}`);
      }
    }
  }
}

export async function setSecret<K extends keyof SecretStore>(
  key: K,
  value: SecretStore[K],
): Promise<void> {
  if (value) {
    await chrome.storage.session.set({ [`secret:${key}`]: value });
    const encrypted = await encrypt(value);
    await chrome.storage.local.set({ [`${SECRET_PREFIX}${key}`]: encrypted });
  } else {
    await chrome.storage.session.remove(`secret:${key}`);
    await chrome.storage.local.remove(`${SECRET_PREFIX}${key}`);
  }
}

export async function getSecret<K extends keyof SecretStore>(
  key: K,
): Promise<SecretStore[K] | null> {
  const result = await chrome.storage.session.get(`secret:${key}`);
  return result[`secret:${key}`] ?? null;
}

export async function clearSecrets(): Promise<void> {
  const keys = ALL_SECRET_KEYS;
  await chrome.storage.session.clear();
  await chrome.storage.local.remove(keys.map((k) => `${SECRET_PREFIX}${k}`));
}
