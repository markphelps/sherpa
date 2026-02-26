import type {
  ChangedFile,
  CodeReviewProvider,
  Commit,
  PullRequest,
} from "@/providers/types";
import { parseHunks } from "./parse-diff";

const API_BASE = "https://api.github.com";
const PR_URL_REGEX = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
export const DEFAULT_MAX_FILE_SIZE = 100_000; // ~100KB — prevent large files from blowing LLM context

interface GitHubPrResponse {
  number: number;
  title: string;
  body: string | null;
  head: { ref: string; sha: string };
  base: { ref: string };
}

interface GitHubCommitResponse {
  sha: string;
  commit: { message: string; author?: { name: string } };
  author?: { login: string };
}

interface GitHubFileResponse {
  filename: string;
  patch?: string;
  additions: number;
  deletions: number;
  status: string;
}

/** Extract the `rel="next"` URL from a GitHub Link header, or null. */
export function parseLinkHeader(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

export class GitHubProvider implements CodeReviewProvider {
  name = "github";
  private token: string;
  private onTokenExpired?: () => Promise<string>;

  constructor(token: string, onTokenExpired?: () => Promise<string>) {
    this.token = token;
    this.onTokenExpired = onTokenExpired;
  }

  matchesUrl(url: string): boolean {
    return PR_URL_REGEX.test(url);
  }

  async authenticate(): Promise<void> {
    // OAuth handled externally; this just validates token
    const resp = await this.fetch("/user");
    if (!resp.ok) throw new Error("GitHub authentication failed");
  }

  isAuthenticated(): boolean {
    return this.token.length > 0;
  }

  async getPullRequest(url: string): Promise<PullRequest> {
    const match = url.match(PR_URL_REGEX);
    if (!match) throw new Error(`Not a GitHub PR URL: ${url}`);
    const [, owner, repo, number] = match;
    const prPath = `/repos/${owner}/${repo}/pulls/${number}`;

    const [prResp, commitsData, filesData] = await Promise.all([
      this.fetch(prPath),
      this.fetchAllPages<GitHubCommitResponse>(
        `${prPath}/commits?per_page=100`,
        "commits",
      ),
      this.fetchAllPages<GitHubFileResponse>(
        `${prPath}/files?per_page=100`,
        "files",
      ),
    ]);

    if (!prResp.ok) {
      if (prResp.status === 404) {
        throw new Error(
          `Could not access ${owner}/${repo}#${number}. Make sure the Sherpa GitHub App is installed on the organization or account that owns this repository.`,
        );
      }
      throw new Error(`GitHub API error (PR): ${prResp.status}`);
    }

    const prData = (await prResp.json()) as GitHubPrResponse;

    const commits: Commit[] = commitsData.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.author?.login ?? c.commit.author?.name ?? "unknown",
    }));

    const validStatuses = new Set<ChangedFile["status"]>([
      "added",
      "removed",
      "modified",
      "renamed",
    ]);

    const files: ChangedFile[] = filesData.map((f) => ({
      path: f.filename,
      diff: f.patch ?? "",
      additions: f.additions,
      deletions: f.deletions,
      hunks: parseHunks(f.patch),
      status: validStatuses.has(f.status as ChangedFile["status"])
        ? (f.status as ChangedFile["status"])
        : "modified",
    }));

    return {
      id: `${owner}/${repo}/${number}`,
      number: parseInt(number, 10),
      title: prData.title,
      description: prData.body ?? "",
      sourceBranch: prData.head.ref,
      targetBranch: prData.base.ref,
      headSha: prData.head.sha,
      commits,
      files,
    };
  }

  async getFileContent(
    pr: PullRequest,
    path: string,
    ref: string,
    maxSize = DEFAULT_MAX_FILE_SIZE,
  ): Promise<string> {
    const [owner, repo] = pr.id.split("/");
    const resp = await this.fetch(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
      { headers: { Accept: "application/vnd.github.raw+json" } },
    );
    if (!resp.ok) {
      return `[File unavailable: HTTP ${resp.status}]`;
    }
    const text = await resp.text();
    if (text.length > maxSize) {
      return (
        text.slice(0, maxSize) +
        "\n\n[... truncated — file too large for analysis]"
      );
    }
    return text;
  }

  private async fetchAllPages<T>(
    path: string,
    errorLabel: string,
    maxPages = 10,
  ): Promise<T[]> {
    const resp = await this.fetch(path);
    if (!resp.ok) {
      if (resp.status === 404) {
        throw new Error(
          "Could not access this repository. Make sure the Sherpa GitHub App is installed on the organization or account that owns it.",
        );
      }
      throw new Error(`GitHub API error (${errorLabel}): ${resp.status}`);
    }

    const items: T[] = await resp.json();
    let nextUrl = parseLinkHeader(resp.headers.get("Link"));
    let page = 1;

    while (nextUrl && page < maxPages) {
      const url = new URL(nextUrl);
      const nextResp = await this.fetch(url.pathname + url.search);
      if (!nextResp.ok) {
        if (nextResp.status === 404) {
          throw new Error(
            "Could not access this repository. Make sure the Sherpa GitHub App is installed on the organization or account that owns it.",
          );
        }
        throw new Error(`GitHub API error (${errorLabel}): ${nextResp.status}`);
      }
      const nextItems: T[] = await nextResp.json();
      items.push(...nextItems);
      nextUrl = parseLinkHeader(nextResp.headers.get("Link"));
      page++;
    }

    if (nextUrl) {
      console.warn(
        `[Sherpa] Stopped pagination for ${errorLabel} after ${maxPages} pages — results may be truncated`,
      );
    }

    return items;
  }

  private async fetch(
    path: string,
    init?: RequestInit,
    isRetry = false,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...((init?.headers as Record<string, string>) ?? {}),
    };
    const resp = await fetch(`${API_BASE}${path}`, { ...init, headers });

    if (resp.status === 401 && !isRetry && this.onTokenExpired) {
      this.token = await this.onTokenExpired();
      return this.fetch(path, init, true);
    }

    return resp;
  }
}
