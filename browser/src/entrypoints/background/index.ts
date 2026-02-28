import { buildFileExplanationPrompt } from "@/prompts/file-explanation";
import { buildHunkExplanationPrompt } from "@/prompts/hunk-explanation";
import { buildPrSummaryPrompt } from "@/prompts/pr-summary";
import { GitHubProvider } from "@/providers/github/api";
import {
  launchGitHubOAuth,
  refreshGitHubToken,
} from "@/providers/github/oauth";
import type { PullRequest } from "@/providers/types";
import {
  createMessage,
  type ErrorCategory,
  isMessage,
  type Message,
  MessageType,
} from "@/utils/messaging";
import {
  getSecret,
  initSecureStorage,
  SECRET_GITHUB_REFRESH_TOKEN,
  SECRET_GITHUB_TOKEN,
  SECRET_LLM_API_KEY,
  setSecret,
} from "@/utils/secure-storage";
import {
  defaultSettings,
  makeCacheKey,
  PR_SUMMARY_KEY,
  type Settings,
} from "@/utils/storage";
import {
  acquireLock,
  getCachedExplanation,
  LockStatus,
  setCachedExplanation,
  setLocalCachedExplanation,
  waitForPendingResult,
} from "./cache";
import { generateExplanation } from "./llm";

// Store last PR context so we can resend when the side panel opens
let lastPrContext: { owner: string; repo: string; prNumber: number } | null =
  null;

// In-flight LLM calls keyed by cache key — prevents duplicate work
const inFlight = new Map<string, Promise<string>>();

// In-memory PR cache keyed by "owner/repo/prNumber" — avoids redundant GitHub
// API calls when generating file and hunk explanations.
// Bounded to prevent unbounded memory growth in long sessions.
const PR_CACHE_MAX = 10;
const prCache = new Map<string, PullRequest>();

function prCacheSet(key: string, value: PullRequest): void {
  if (prCache.size >= PR_CACHE_MAX) {
    // Evict oldest entry (first inserted)
    const oldest = prCache.keys().next().value;
    if (oldest !== undefined) prCache.delete(oldest);
  }
  prCache.set(key, value);
}

export default defineBackground(async () => {
  console.log("Sherpa background loaded");

  // Decrypt persisted secrets into session cache
  await initSecureStorage();

  // Open side panel when extension icon is clicked
  chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });

  // Detect when the user navigates to a different page/PR in the active tab.
  // This handles SPA navigations that don't trigger a content script reload.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;
    const url = changeInfo.url;
    // Only care about the active tab
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([active]) => {
        if (active?.id !== tabId) return;
        const ctx = parsePrUrl(url);
        if (ctx) {
          // Different PR — update context
          if (
            !lastPrContext ||
            lastPrContext.owner !== ctx.owner ||
            lastPrContext.repo !== ctx.repo ||
            lastPrContext.prNumber !== ctx.prNumber
          ) {
            lastPrContext = ctx;
            chrome.runtime
              .sendMessage(createMessage(MessageType.PR_CONTEXT, ctx))
              .catch(() => {});
          }
        } else if (lastPrContext) {
          // Navigated away from a PR page — clear
          lastPrContext = null;
          chrome.runtime
            .sendMessage(createMessage(MessageType.PR_CONTEXT_CLEAR, {}))
            .catch(() => {});
        }
      });
  });

  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      // Handle OAuth separately — it's not part of the typed message system
      if (
        message !== null &&
        typeof message === "object" &&
        (message as Record<string, unknown>).type === "START_GITHUB_OAUTH"
      ) {
        getSettings()
          .then((s) => launchGitHubOAuth(s.workerUrl))
          .then((result) => handleOAuthToken(result))
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
      }

      if (!isMessage(message)) return;

      // Only handle PR_CONTEXT from content scripts (has sender.tab)
      if (message.type === MessageType.PR_CONTEXT && sender.tab) {
        lastPrContext = message.payload;
        // Forward to side panel
        chrome.runtime.sendMessage(message).catch(() => {});
        return;
      }

      // When side panel opens, check active tab URL instead of replaying stale context
      if (message.type === MessageType.SIDE_PANEL_READY && !sender.tab) {
        validateAndSendContext().catch(() => {});
        return;
      }

      // Side panel requests PR detection from the active tab URL
      if (message.type === MessageType.DETECT_PR && !sender.tab) {
        detectPrFromActiveTab().catch(console.error);
        return;
      }

      // Ignore messages echoed back to ourselves
      if (
        message.type === MessageType.PR_CONTEXT ||
        message.type === MessageType.SIDE_PANEL_READY ||
        message.type === MessageType.PR_DATA ||
        message.type === MessageType.ERROR ||
        message.type === MessageType.DETECT_PR ||
        message.type === MessageType.PR_CONTEXT_CLEAR
      )
        return;

      handleMessage(message).catch((err) => {
        console.error("Sherpa:", err);
        const errorMessage =
          err instanceof Error ? err.message : "An unexpected error occurred";
        broadcastError(classifyError(err), errorMessage);
      });
    },
  );
});

interface TokenData {
  token: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
}

async function handleOAuthToken(data: TokenData): Promise<void> {
  // Store tokens in encrypted secure storage
  await setSecret(SECRET_GITHUB_TOKEN, data.token);
  await setSecret(SECRET_GITHUB_REFRESH_TOKEN, data.refreshToken ?? null);

  // Store non-secret metadata in settings
  const settings = await getSettings();
  const updated: Settings = {
    ...settings,
    codeReviewProviders: {
      ...settings.codeReviewProviders,
      github: {
        expiresAt: data.expiresAt ?? null,
        enabled: true,
      },
    },
  };
  await chrome.storage.local.set({ settings: updated });
  authValid = { token: data.token, expiresAt: Date.now() + AUTH_CACHE_TTL };
  console.log("Sherpa: GitHub token saved");
}

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get("settings");
  const stored = result.settings as Partial<Settings> | undefined;
  if (!stored) return defaultSettings;
  return {
    llm: { ...defaultSettings.llm, ...stored.llm },
    codeReviewProviders: {
      github: {
        ...defaultSettings.codeReviewProviders.github,
        ...stored.codeReviewProviders?.github,
      },
    },
    ui: { ...defaultSettings.ui, ...stored.ui },
    workerUrl: stored.workerUrl ?? defaultSettings.workerUrl,
  };
}

async function getProvider(): Promise<GitHubProvider> {
  const token = (await getSecret(SECRET_GITHUB_TOKEN)) ?? "";

  const onTokenExpired = async (): Promise<string> => {
    const currentSettings = await getSettings();
    const refreshToken = await getSecret(SECRET_GITHUB_REFRESH_TOKEN);
    const currentToken = (await getSecret(SECRET_GITHUB_TOKEN)) ?? "";
    const workerUrl = currentSettings.workerUrl;

    // Try silent refresh first
    if (refreshToken && currentToken) {
      try {
        const result = await refreshGitHubToken(
          refreshToken,
          workerUrl,
          currentToken,
        );
        await handleOAuthToken(result);
        return result.token;
      } catch {
        console.log(
          "Sherpa: silent refresh failed, falling back to OAuth popup",
        );
      }
    }

    // Fall back to OAuth popup
    const result = await launchGitHubOAuth(workerUrl);
    await handleOAuthToken(result);
    return result.token;
  };

  return new GitHubProvider(token, onTokenExpired);
}

// Cache auth status to avoid hammering GitHub API on every message
let authValid: { token: string; expiresAt: number } | null = null;
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const PROACTIVE_REFRESH_MARGIN = 5 * 60 * 1000; // 5 minutes

async function checkGitHubAuth(): Promise<boolean> {
  const token = (await getSecret(SECRET_GITHUB_TOKEN)) ?? "";
  if (!token) return false;

  const settings = await getSettings();
  const github = settings.codeReviewProviders.github;

  // Proactive refresh: if token expires within 5 minutes, refresh silently
  const expiresAt = github?.expiresAt;
  if (expiresAt && Date.now() > expiresAt - PROACTIVE_REFRESH_MARGIN) {
    const refreshToken = await getSecret(SECRET_GITHUB_REFRESH_TOKEN);
    if (refreshToken) {
      try {
        const result = await refreshGitHubToken(
          refreshToken,
          settings.workerUrl,
          token,
        );
        await handleOAuthToken(result);
        return true;
      } catch {
        // Refresh failed; fall through to normal validation
      }
    }
  }

  // Return cached result if the token hasn't changed
  if (
    authValid &&
    authValid.token === token &&
    Date.now() < authValid.expiresAt
  ) {
    return true;
  }

  const provider = new GitHubProvider(token);
  try {
    await provider.authenticate();
    authValid = { token, expiresAt: Date.now() + AUTH_CACHE_TTL };
    return true;
  } catch {
    authValid = null;
    return false;
  }
}

function classifyError(err: unknown): ErrorCategory {
  if (err instanceof TypeError) return "network";
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("authentication") || msg.includes("token")) return "auth";
  if (msg.includes("could not access") || msg.includes("404")) return "access";
  if (msg.includes("api error")) return "api";
  return "unknown";
}

function broadcastError(category: ErrorCategory, message: string): void {
  chrome.runtime
    .sendMessage(createMessage(MessageType.ERROR, { category, message }))
    .catch(() => {});
}

/** Parse PR context from a URL using the same pattern as the DOM adapter. */
function parsePrUrl(
  url: string,
): { owner: string; repo: string; prNumber: number } | null {
  // GitHub: github.com/:owner/:repo/pull/:number
  const gh = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (gh) return { owner: gh[1], repo: gh[2], prNumber: parseInt(gh[3], 10) };
  // Future providers: add patterns here (GitLab, Bitbucket, etc.)
  return null;
}

/**
 * Check the active tab URL and send the appropriate context to the side panel.
 * If the tab is on a PR, send PR_CONTEXT. Otherwise, send PR_CONTEXT_CLEAR so
 * the side panel resets to the default "Evaluate this PR" screen.
 */
async function validateAndSendContext(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ctx = tab?.url ? parsePrUrl(tab.url) : null;
  if (ctx) {
    lastPrContext = ctx;
    chrome.runtime
      .sendMessage(createMessage(MessageType.PR_CONTEXT, ctx))
      .catch(() => {});
  } else {
    lastPrContext = null;
    chrome.runtime
      .sendMessage(createMessage(MessageType.PR_CONTEXT_CLEAR, {}))
      .catch(() => {});
  }
}

async function detectPrFromActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    broadcastError(
      "unknown",
      "No active tab found. Please open a GitHub pull request.",
    );
    return;
  }
  const ctx = parsePrUrl(tab.url);
  if (!ctx) {
    broadcastError(
      "unknown",
      "This page doesn't look like a pull request. Navigate to a GitHub PR and try again.",
    );
    return;
  }
  lastPrContext = ctx;
  chrome.runtime
    .sendMessage(createMessage(MessageType.PR_CONTEXT, ctx))
    .catch(() => {});
}

async function handleMessage(message: Message): Promise<void> {
  const settings = await getSettings();
  const githubToken = (await getSecret(SECRET_GITHUB_TOKEN)) ?? null;
  const llmApiKey = (await getSecret(SECRET_LLM_API_KEY)) ?? "";

  // Preflight auth check for any message that needs GitHub access
  if (
    message.type === MessageType.EXPLAIN_PR ||
    message.type === MessageType.EXPLAIN_FILE ||
    message.type === MessageType.EXPLAIN_HUNK
  ) {
    const authed = await checkGitHubAuth();
    if (!authed) {
      broadcastError(
        "auth",
        "GitHub token is missing or expired. Please re-authenticate.",
      );
      return;
    }
  }

  switch (message.type) {
    case MessageType.EXPLAIN_PR: {
      const { owner, repo, prNumber } = message.payload;
      const prCtx = { owner, repo, prNumber };
      const provider = await getProvider();
      const url = `https://github.com/${owner}/${repo}/pull/${prNumber}`;
      const pr = await provider.getPullRequest(url);
      prCacheSet(`${owner}/${repo}/${prNumber}`, pr);

      // Send head SHA and file list to the side panel
      chrome.runtime
        .sendMessage(
          createMessage(MessageType.PR_DATA, {
            headSha: pr.headSha,
            files: pr.files,
          }),
        )
        .catch(() => {});

      const cacheKey = makeCacheKey(
        prNumber,
        pr.headSha,
        PR_SUMMARY_KEY,
        settings.ui.explanationDetail,
      );
      const cached = await getCachedExplanation(
        cacheKey,
        prCtx,
        settings.workerUrl,
        githubToken,
      );
      if (cached) {
        broadcastExplanation(cacheKey, cached, false);
        return;
      }

      // Try to acquire the generation lock
      const lock = await acquireLock(
        cacheKey,
        prCtx,
        settings.workerUrl,
        githubToken,
      );
      if (lock?.status === LockStatus.HIT) {
        broadcastExplanation(cacheKey, lock.text, false);
        return;
      }
      if (lock?.status === LockStatus.PENDING) {
        // Another client is generating — wait for their result
        const result = await waitForPendingResult(
          cacheKey,
          prCtx,
          settings.workerUrl,
          githubToken,
        );
        if (result) {
          await setLocalCachedExplanation(cacheKey, result);
          broadcastExplanation(cacheKey, result, false);
          return;
        }
        // Lock expired without result — fall through to generate ourselves
      }

      const prompt = buildPrSummaryPrompt(pr, settings.ui.explanationDetail);
      const text = await deduplicatedGenerate(cacheKey, async () => {
        const result = await generateExplanation(
          prompt,
          settings.llm,
          llmApiKey,
          (partial) => {
            broadcastExplanation(cacheKey, partial, true);
          },
        );
        await setCachedExplanation(
          cacheKey,
          result,
          prCtx,
          settings.workerUrl,
          githubToken,
        );
        return result;
      });
      broadcastExplanation(cacheKey, text, false);
      break;
    }

    case MessageType.EXPLAIN_FILE: {
      const { owner, repo, prNumber, filePath, commitSha } = message.payload;
      const prCtx = { owner, repo, prNumber };
      const cacheKey = makeCacheKey(
        prNumber,
        commitSha,
        filePath,
        settings.ui.explanationDetail,
      );
      const cached = await getCachedExplanation(
        cacheKey,
        prCtx,
        settings.workerUrl,
        githubToken,
      );
      if (cached) {
        broadcastExplanation(cacheKey, cached, false);
        return;
      }

      // Try to acquire the generation lock
      const fileLock = await acquireLock(
        cacheKey,
        prCtx,
        settings.workerUrl,
        githubToken,
      );
      if (fileLock?.status === LockStatus.HIT) {
        broadcastExplanation(cacheKey, fileLock.text, false);
        return;
      }
      if (fileLock?.status === LockStatus.PENDING) {
        const result = await waitForPendingResult(
          cacheKey,
          prCtx,
          settings.workerUrl,
          githubToken,
        );
        if (result) {
          await setLocalCachedExplanation(cacheKey, result);
          broadcastExplanation(cacheKey, result, false);
          return;
        }
      }

      const prKey = `${owner}/${repo}/${prNumber}`;
      let pr = prCache.get(prKey);
      if (!pr) {
        const provider = await getProvider();
        const url = `https://github.com/${owner}/${repo}/pull/${prNumber}`;
        pr = await provider.getPullRequest(url);
        prCacheSet(prKey, pr);
      }
      const file = pr.files.find((f) => f.path === filePath);
      if (!file) return;

      const provider = await getProvider();
      const fullContent = await provider.getFileContent(
        pr,
        filePath,
        commitSha,
        settings.ui.maxFileSize,
      );
      const prSummaryCacheKey = makeCacheKey(
        prNumber,
        commitSha,
        PR_SUMMARY_KEY,
        settings.ui.explanationDetail,
      );
      const prSummary =
        (await getCachedExplanation(
          prSummaryCacheKey,
          prCtx,
          settings.workerUrl,
          githubToken,
        )) ?? pr.title;

      const prompt = buildFileExplanationPrompt({
        prSummary,
        filePath,
        diff: file.diff,
        fullFileContent: fullContent,
        detail: settings.ui.explanationDetail,
      });
      const text = await deduplicatedGenerate(cacheKey, async () => {
        const result = await generateExplanation(
          prompt,
          settings.llm,
          llmApiKey,
          (partial) => {
            broadcastExplanation(cacheKey, partial, true);
          },
        );
        await setCachedExplanation(
          cacheKey,
          result,
          prCtx,
          settings.workerUrl,
          githubToken,
        );
        return result;
      });
      broadcastExplanation(cacheKey, text, false);
      break;
    }

    case MessageType.EXPLAIN_HUNK: {
      const { owner, repo, prNumber, filePath, commitSha, hunkIndex } =
        message.payload;
      const prCtx = { owner, repo, prNumber };
      const cacheKey = makeCacheKey(
        prNumber,
        commitSha,
        filePath,
        settings.ui.explanationDetail,
        hunkIndex,
      );
      const cached = await getCachedExplanation(
        cacheKey,
        prCtx,
        settings.workerUrl,
        githubToken,
      );
      if (cached) {
        broadcastExplanation(cacheKey, cached, false);
        return;
      }

      // Try to acquire the generation lock
      const hunkLock = await acquireLock(
        cacheKey,
        prCtx,
        settings.workerUrl,
        githubToken,
      );
      if (hunkLock?.status === LockStatus.HIT) {
        broadcastExplanation(cacheKey, hunkLock.text, false);
        return;
      }
      if (hunkLock?.status === LockStatus.PENDING) {
        const result = await waitForPendingResult(
          cacheKey,
          prCtx,
          settings.workerUrl,
          githubToken,
        );
        if (result) {
          await setLocalCachedExplanation(cacheKey, result);
          broadcastExplanation(cacheKey, result, false);
          return;
        }
      }

      const hunkPrKey = `${owner}/${repo}/${prNumber}`;
      let hunkPr = prCache.get(hunkPrKey);
      if (!hunkPr) {
        const provider = await getProvider();
        const url = `https://github.com/${owner}/${repo}/pull/${prNumber}`;
        hunkPr = await provider.getPullRequest(url);
        prCacheSet(hunkPrKey, hunkPr);
      }
      const file = hunkPr.files.find((f) => f.path === filePath);
      const hunk = file?.hunks[hunkIndex];
      if (!file || !hunk) return;

      const prSummaryCacheKey = makeCacheKey(
        prNumber,
        commitSha,
        PR_SUMMARY_KEY,
        settings.ui.explanationDetail,
      );
      const prSummary =
        (await getCachedExplanation(
          prSummaryCacheKey,
          prCtx,
          settings.workerUrl,
          githubToken,
        )) ?? hunkPr.title;
      const fileSummaryCacheKey = makeCacheKey(
        prNumber,
        commitSha,
        filePath,
        settings.ui.explanationDetail,
      );
      const fileSummary =
        (await getCachedExplanation(
          fileSummaryCacheKey,
          prCtx,
          settings.workerUrl,
          githubToken,
        )) ?? "";

      const prompt = buildHunkExplanationPrompt({
        prSummary,
        fileSummary,
        filePath,
        hunkHeader: hunk.header,
        hunkDiff: hunk.diff,
        detail: settings.ui.explanationDetail,
      });
      const text = await deduplicatedGenerate(cacheKey, async () => {
        const result = await generateExplanation(
          prompt,
          settings.llm,
          llmApiKey,
          (partial) => {
            broadcastExplanation(cacheKey, partial, true);
          },
        );
        await setCachedExplanation(
          cacheKey,
          result,
          prCtx,
          settings.workerUrl,
          githubToken,
        );
        return result;
      });
      broadcastExplanation(cacheKey, text, false);
      break;
    }
  }
}

/**
 * Run an LLM generation with in-flight deduplication. If a generation for the
 * same cacheKey is already running, we piggy-back on it and broadcast the
 * final result when it lands rather than starting a second LLM call.
 */
async function deduplicatedGenerate(
  cacheKey: string,
  generate: () => Promise<string>,
): Promise<string> {
  const existing = inFlight.get(cacheKey);
  if (existing) {
    // Piggyback on the existing request but swallow errors — the original
    // caller is responsible for error broadcasting.
    try {
      return await existing;
    } catch {
      return "";
    }
  }

  const promise = generate().finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

function broadcastExplanation(
  key: string,
  text: string,
  streaming: boolean,
): void {
  const msg = createMessage(MessageType.EXPLANATION_RESULT, {
    key,
    text,
    streaming,
  });
  chrome.runtime.sendMessage(msg).catch(() => {
    // Side panel may not be open; ignore
  });
}
