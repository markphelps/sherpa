import { describe, expect, it } from "vitest";
import { defaultSettings, makeCacheKey } from "./storage";

describe("storage", () => {
  it("has sensible default settings", () => {
    expect(defaultSettings.llm.provider).toBe("anthropic");
    expect(defaultSettings.ui.autoScrollSync).toBe(true);
    expect(defaultSettings.ui.explanationDetail).toBe("concise");
  });

  it("builds cache keys correctly", () => {
    const key = makeCacheKey(2752, "abc123", "src/main.ts", "concise");
    expect(key).toBe("2752:abc123:src/main.ts:concise");
  });

  it("builds cache keys with hunk index", () => {
    const key = makeCacheKey(2752, "abc123", "src/main.ts", "concise", 2);
    expect(key).toBe("2752:abc123:src/main.ts:concise:2");
  });

  it("produces different cache keys for different detail levels", () => {
    const concise = makeCacheKey(2752, "abc123", "src/main.ts", "concise");
    const detailed = makeCacheKey(2752, "abc123", "src/main.ts", "detailed");
    expect(concise).not.toBe(detailed);
  });
});
