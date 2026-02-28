import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Polyfill Web Crypto for Node
Object.defineProperty(globalThis, "crypto", { value: webcrypto });

// Mock chrome APIs
const localStore: Record<string, unknown> = {};
const sessionStore: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[]) => {
        if (Array.isArray(key)) {
          const result: Record<string, unknown> = {};
          for (const k of key) result[k] = localStore[k];
          return result;
        }
        return { [key]: localStore[key] };
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(localStore, obj);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete localStore[k];
      }),
    },
    session: {
      get: vi.fn(async (key: string) => {
        return { [key]: sessionStore[key] };
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(sessionStore, obj);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete sessionStore[k];
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(sessionStore)) delete sessionStore[k];
      }),
      setAccessLevel: vi.fn(async () => {}),
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

// Import after mocks are set up
import {
  clearSecrets,
  getSecret,
  initSecureStorage,
  SECRET_GITHUB_TOKEN,
  SECRET_LLM_API_KEY,
  setSecret,
} from "./secure-storage";

describe("secure-storage", () => {
  beforeEach(() => {
    for (const key of Object.keys(localStore)) delete localStore[key];
    for (const key of Object.keys(sessionStore)) delete sessionStore[key];
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of Object.keys(localStore)) delete localStore[key];
    for (const key of Object.keys(sessionStore)) delete sessionStore[key];
  });

  it("initSecureStorage sets TRUSTED_CONTEXTS access level", async () => {
    await initSecureStorage();
    expect(chromeMock.storage.session.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  });

  it("setSecret stores encrypted value in local and plaintext in session", async () => {
    await setSecret(SECRET_LLM_API_KEY, "sk-test-123");

    // Session has plaintext
    expect(sessionStore["secret:llmApiKey"]).toBe("sk-test-123");

    // Local has encrypted value (not plaintext)
    const encKey = "_enc:llmApiKey";
    expect(localStore[encKey]).toBeDefined();
    expect(localStore[encKey]).not.toBe("sk-test-123");
  });

  it("getSecret reads from session storage", async () => {
    await setSecret(SECRET_LLM_API_KEY, "sk-test-456");
    const result = await getSecret(SECRET_LLM_API_KEY);
    expect(result).toBe("sk-test-456");
  });

  it("getSecret returns null for missing keys", async () => {
    const result = await getSecret(SECRET_LLM_API_KEY);
    expect(result).toBeNull();
  });

  it("setSecret with null clears both stores", async () => {
    await setSecret(SECRET_GITHUB_TOKEN, "ghp_abc123");
    expect(sessionStore["secret:githubToken"]).toBe("ghp_abc123");
    expect(localStore["_enc:githubToken"]).toBeDefined();

    await setSecret(SECRET_GITHUB_TOKEN, null);
    expect(sessionStore["secret:githubToken"]).toBeUndefined();
    expect(localStore["_enc:githubToken"]).toBeUndefined();
  });

  it("clearSecrets removes all secrets from both stores", async () => {
    await setSecret(SECRET_LLM_API_KEY, "sk-test");
    await setSecret(SECRET_GITHUB_TOKEN, "ghp_test");

    await clearSecrets();
    expect(chromeMock.storage.session.clear).toHaveBeenCalled();
    expect(localStore["_enc:llmApiKey"]).toBeUndefined();
    expect(localStore["_enc:githubToken"]).toBeUndefined();
  });

  it("initSecureStorage hydrates session from encrypted local storage", async () => {
    // First, store a secret
    await setSecret(SECRET_LLM_API_KEY, "sk-hydration-test");
    const encryptedValue = localStore["_enc:llmApiKey"];

    // Clear session to simulate browser restart
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    expect(sessionStore["secret:llmApiKey"]).toBeUndefined();

    // Hydrate
    await initSecureStorage();

    // Session should be repopulated from encrypted local
    expect(sessionStore["secret:llmApiKey"]).toBe("sk-hydration-test");
    // Encrypted local value should be unchanged
    expect(localStore["_enc:llmApiKey"]).toBe(encryptedValue);
  });

  it("initSecureStorage clears corrupt encrypted data", async () => {
    // Put corrupt data in local
    localStore["_enc:llmApiKey"] = "not-valid-base64-ciphertext!!!";

    await initSecureStorage();

    // Corrupt data should be removed
    expect(localStore["_enc:llmApiKey"]).toBeUndefined();
    // Session should not have a value
    expect(sessionStore["secret:llmApiKey"]).toBeUndefined();
  });
});
