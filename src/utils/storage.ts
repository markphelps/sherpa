export interface LlmSettings {
  provider: "openai" | "anthropic" | "google";
  model: string;
}

export interface ProviderAuth {
  expiresAt?: number | null;
  enabled: boolean;
}

export type ThemePreference = "system" | "light" | "dark";

export interface UiSettings {
  autoScrollSync: boolean;
  explanationDetail: "concise" | "balanced" | "detailed";
  maxFileSize: number;
  theme: ThemePreference;
}

export interface Settings {
  llm: LlmSettings;
  codeReviewProviders: { github: ProviderAuth };
  ui: UiSettings;
  workerUrl: string;
}

export const defaultSettings: Settings = {
  llm: {
    provider: "anthropic",
    model: "",
  },
  codeReviewProviders: {
    github: { enabled: true },
  },
  ui: {
    autoScrollSync: true,
    explanationDetail: "concise",
    maxFileSize: 100_000,
    theme: "system" as ThemePreference,
  },
  workerUrl: import.meta.env.VITE_WORKER_URL ?? "",
};

export const CACHE_PREFIX = "explanation:";
export const PR_SUMMARY_KEY = "__pr_summary__";

export interface CacheEntry {
  key: string;
  text: string;
  createdAt: number;
}

export function makeCacheKey(
  prNumber: number,
  commitSha: string,
  filePath: string,
  detail: UiSettings["explanationDetail"],
  hunkIndex?: number,
): string {
  const base = `${prNumber}:${commitSha}:${filePath}:${detail}`;
  return hunkIndex !== undefined ? `${base}:${hunkIndex}` : base;
}
