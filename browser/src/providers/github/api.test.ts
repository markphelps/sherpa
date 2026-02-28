import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubProvider, parseLinkHeader } from "./api";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("parseLinkHeader", () => {
  it("returns null for missing header", () => {
    expect(parseLinkHeader(null)).toBeNull();
  });

  it("parses next URL from Link header", () => {
    const header =
      '<https://api.github.com/repos/o/r/pulls/1/files?per_page=100&page=2>; rel="next", <https://api.github.com/repos/o/r/pulls/1/files?per_page=100&page=5>; rel="last"';
    expect(parseLinkHeader(header)).toBe(
      "https://api.github.com/repos/o/r/pulls/1/files?per_page=100&page=2",
    );
  });

  it("returns null when no next link", () => {
    const header =
      '<https://api.github.com/repos/o/r/pulls/1/files?per_page=100&page=1>; rel="first"';
    expect(parseLinkHeader(header)).toBeNull();
  });
});

describe("GitHubProvider", () => {
  let provider: GitHubProvider;

  beforeEach(() => {
    provider = new GitHubProvider("fake-token");
    mockFetch.mockReset();
  });

  it("matchesUrl returns true for GitHub PR URLs", () => {
    expect(
      provider.matchesUrl("https://github.com/replicate/cog/pull/2752/files"),
    ).toBe(true);
    expect(provider.matchesUrl("https://github.com/owner/repo/pull/1")).toBe(
      true,
    );
    expect(
      provider.matchesUrl("https://github.com/owner/repo/pull/1/files"),
    ).toBe(true);
  });

  it("matchesUrl returns false for non-PR URLs", () => {
    expect(provider.matchesUrl("https://github.com/replicate/cog")).toBe(false);
    expect(
      provider.matchesUrl("https://gitlab.com/owner/repo/merge_requests/1"),
    ).toBe(false);
  });

  it("isAuthenticated returns true when token is set", () => {
    expect(provider.isAuthenticated()).toBe(true);
    const noAuth = new GitHubProvider("");
    expect(noAuth.isAuthenticated()).toBe(false);
  });

  it("getPullRequest fetches PR, commits, and files", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 2752,
          title: "feat: metrics API",
          body: "Adds metrics",
          head: { ref: "feature", sha: "abc123" },
          base: { ref: "main" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => [
          {
            sha: "abc123",
            commit: { message: "add metrics" },
            author: { login: "user" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => [
          {
            filename: "src/main.ts",
            patch: "@@ -1,3 +1,4 @@\n foo\n+bar\n baz",
            additions: 1,
            deletions: 0,
            status: "modified",
          },
        ],
      });

    const pr = await provider.getPullRequest(
      "https://github.com/replicate/cog/pull/2752",
    );
    expect(pr.number).toBe(2752);
    expect(pr.title).toBe("feat: metrics API");
    expect(pr.headSha).toBe("abc123");
    expect(pr.commits).toHaveLength(1);
    expect(pr.files).toHaveLength(1);
    expect(pr.files[0].hunks).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries request with new token on 401", async () => {
    const onTokenExpired = vi.fn().mockResolvedValue("new-token");
    const provider = new GitHubProvider("expired-token", onTokenExpired);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401 }) // first attempt: 401
      .mockResolvedValueOnce({ ok: true, status: 200 }); // retry: success

    await provider.authenticate();

    expect(onTokenExpired).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Second call should use new token
    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[1].headers.Authorization).toBe("Bearer new-token");
  });

  it("throws after retry if second attempt also fails", async () => {
    const onTokenExpired = vi.fn().mockResolvedValue("new-token");
    const provider = new GitHubProvider("expired-token", onTokenExpired);

    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(provider.authenticate()).rejects.toThrow(
      "GitHub authentication failed",
    );
    expect(onTokenExpired).toHaveBeenCalledOnce();
  });

  it("paginates commits when Link header has next", async () => {
    const prUrl = "https://github.com/owner/repo/pull/1";
    // Parallel: PR metadata, commits page 1, files page 1
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 1,
          title: "test",
          body: null,
          head: { ref: "feat", sha: "aaa" },
          base: { ref: "main" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          Link: '<https://api.github.com/repos/owner/repo/pulls/1/commits?per_page=100&page=2>; rel="next"',
        }),
        json: async () => [
          { sha: "c1", commit: { message: "m1" }, author: { login: "u1" } },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => [
          {
            filename: "a.ts",
            patch: "",
            additions: 1,
            deletions: 0,
            status: "added",
          },
        ],
      })
      // Commits page 2
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => [
          { sha: "c2", commit: { message: "m2" }, author: { login: "u2" } },
        ],
      });

    const pr = await provider.getPullRequest(prUrl);
    expect(pr.commits).toHaveLength(2);
    expect(pr.commits[0].sha).toBe("c1");
    expect(pr.commits[1].sha).toBe("c2");
  });

  it("paginates files when Link header has next", async () => {
    const prUrl = "https://github.com/owner/repo/pull/1";
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 1,
          title: "test",
          body: null,
          head: { ref: "feat", sha: "aaa" },
          base: { ref: "main" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => [
          { sha: "c1", commit: { message: "m1" }, author: { login: "u1" } },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          Link: '<https://api.github.com/repos/owner/repo/pulls/1/files?per_page=100&page=2>; rel="next"',
        }),
        json: async () => [
          {
            filename: "a.ts",
            patch: "",
            additions: 1,
            deletions: 0,
            status: "added",
          },
        ],
      })
      // Files page 2
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => [
          {
            filename: "b.ts",
            patch: "",
            additions: 2,
            deletions: 0,
            status: "added",
          },
        ],
      });

    const pr = await provider.getPullRequest(prUrl);
    expect(pr.files).toHaveLength(2);
    expect(pr.files[0].path).toBe("a.ts");
    expect(pr.files[1].path).toBe("b.ts");
  });

  it("stops paginating at maxPages and warns", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const prUrl = "https://github.com/owner/repo/pull/1";

    const linkHeader = new Headers({
      Link: '<https://api.github.com/repos/owner/repo/pulls/1/files?per_page=100&page=2>; rel="next"',
    });

    // PR metadata
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        number: 1,
        title: "test",
        body: null,
        head: { ref: "feat", sha: "aaa" },
        base: { ref: "main" },
      }),
    });
    // Commits page 1 (no pagination)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers(),
      json: async () => [
        { sha: "c1", commit: { message: "m1" }, author: { login: "u1" } },
      ],
    });
    // Files page 1 + 9 more pages (all with next link = 10 total, hitting maxPages)
    for (let i = 0; i < 10; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: linkHeader,
        json: async () => [
          {
            filename: `file${i}.ts`,
            patch: "",
            additions: 1,
            deletions: 0,
            status: "added",
          },
        ],
      });
    }

    const pr = await provider.getPullRequest(prUrl);
    // 10 pages of 1 file each
    expect(pr.files).toHaveLength(10);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("pagination"));
    warnSpy.mockRestore();
  });

  it("does not retry on non-401 errors", async () => {
    const onTokenExpired = vi.fn();
    const provider = new GitHubProvider("token", onTokenExpired);

    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(provider.authenticate()).rejects.toThrow(
      "GitHub authentication failed",
    );
    expect(onTokenExpired).not.toHaveBeenCalled();
  });
});
