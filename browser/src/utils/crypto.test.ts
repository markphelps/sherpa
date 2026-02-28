import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, getOrCreateSalt, resetCryptoCache } from "./crypto";

// Polyfill Web Crypto for Node
Object.defineProperty(globalThis, "crypto", { value: webcrypto });

// Mock chrome APIs
const localStore: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => {
        return { [key]: localStore[key] };
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(localStore, obj);
      }),
    },
  },
  runtime: {
    id: "test-extension-id-abc123",
  },
};

Object.defineProperty(globalThis, "chrome", {
  value: chromeMock,
  writable: true,
});

describe("crypto", () => {
  beforeEach(() => {
    for (const key of Object.keys(localStore)) delete localStore[key];
    resetCryptoCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of Object.keys(localStore)) delete localStore[key];
    resetCryptoCache();
  });

  it("getOrCreateSalt creates and persists a salt", async () => {
    const salt = await getOrCreateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
    expect(localStore._encSalt).toBeDefined();
  });

  it("getOrCreateSalt returns the same salt on subsequent calls", async () => {
    const salt1 = await getOrCreateSalt();
    const salt2 = await getOrCreateSalt();
    expect(Array.from(salt1)).toEqual(Array.from(salt2));
  });

  it("round-trip encrypt/decrypt returns the original plaintext", async () => {
    const plaintext = "sk-test-api-key-12345";
    const encrypted = await encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts to different ciphertext each time (random IV)", async () => {
    const plaintext = "my-secret-key";
    const enc1 = await encrypt(plaintext);
    const enc2 = await encrypt(plaintext);
    expect(enc1).not.toBe(enc2);

    // Both decrypt to the same value
    expect(await decrypt(enc1)).toBe(plaintext);
    expect(await decrypt(enc2)).toBe(plaintext);
  });

  it("handles empty string", async () => {
    const encrypted = await encrypt("");
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles unicode content", async () => {
    const plaintext = "key-with-unicode-\u2603-\u{1F680}";
    const encrypted = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("throws on corrupt ciphertext", async () => {
    const encrypted = await encrypt("test");
    const corrupted = `${encrypted.slice(0, -4)}XXXX`;
    await expect(decrypt(corrupted)).rejects.toThrow();
  });

  it("throws when salt changes between encrypt and decrypt", async () => {
    const encrypted = await encrypt("test");
    // Clear the salt and cache so a new one is generated
    delete localStore._encSalt;
    resetCryptoCache();
    await expect(decrypt(encrypted)).rejects.toThrow();
  });
});
