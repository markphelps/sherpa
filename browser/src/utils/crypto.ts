/**
 * AES-GCM encryption utilities using Web Crypto API.
 *
 * Derives an encryption key via PBKDF2 from the extension ID and a
 * per-install random salt stored in chrome.storage.local. This is
 * obfuscation (not true encryption) since any code in the extension
 * context could reproduce the key, but it prevents casual inspection
 * of stored secrets via DevTools or disk forensics.
 */

let cachedSalt: Uint8Array | null = null;
let cachedKey: CryptoKey | null = null;

/** Reset cached key material. Exported for testing only. */
export function resetCryptoCache(): void {
  cachedSalt = null;
  cachedKey = null;
}

export async function getOrCreateSalt(): Promise<Uint8Array> {
  if (cachedSalt) return cachedSalt;
  const result = await chrome.storage.local.get("_encSalt");
  if (result._encSalt) {
    cachedSalt = new Uint8Array(result._encSalt);
    return cachedSalt;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ _encSalt: Array.from(salt) });
  cachedSalt = salt;
  return salt;
}

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const extensionId = chrome.runtime.id;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(extensionId),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  cachedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

export async function encrypt(plaintext: string): Promise<string> {
  const salt = await getOrCreateSalt();
  const key = await deriveKey(salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const packed = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.length);
  let binary = "";
  for (let i = 0; i < packed.length; i++)
    binary += String.fromCharCode(packed[i]);
  return btoa(binary);
}

export async function decrypt(encoded: string): Promise<string> {
  const salt = await getOrCreateSalt();
  const key = await deriveKey(salt);
  const packed = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}
