import { describe, expect, it } from "vitest";
import { buildCacheUrl, buildMetadataUrl } from "./cache";

describe("buildCacheUrl", () => {
  it("constructs correct summary URL", () => {
    const url = buildCacheUrl(
      "https://worker.example.com",
      {
        owner: "octocat",
        repo: "hello",
        prNumber: 42,
      },
      "42:abc123:src/foo.ts:concise",
    );
    expect(url).toBe(
      "https://worker.example.com/cache/octocat/hello/42/summary?key=42%3Aabc123%3Asrc%2Ffoo.ts%3Aconcise",
    );
  });
});

describe("buildMetadataUrl", () => {
  it("constructs correct metadata URL", () => {
    const url = buildMetadataUrl(
      "https://worker.example.com",
      {
        owner: "octocat",
        repo: "hello",
        prNumber: 42,
      },
      "42:abc123:__pr_metadata__:_",
    );
    expect(url).toBe(
      "https://worker.example.com/cache/octocat/hello/42/metadata?key=42%3Aabc123%3A__pr_metadata__%3A_",
    );
  });
});
