import { useEffect, useState } from "preact/hooks";
import type { ChangedFile } from "@/providers/types";
import {
  createMessage,
  type ErrorPayload,
  isMessage,
  MessageType,
  type PrContextPayload,
} from "@/utils/messaging";
import {
  getSecret,
  SECRET_GITHUB_TOKEN,
  SECRET_LLM_API_KEY,
} from "@/utils/secure-storage";
import {
  defaultSettings,
  makeCacheKey,
  PR_SUMMARY_KEY,
  type UiSettings,
} from "@/utils/storage";
import { ErrorState } from "./components/ErrorState";
import { FileSection } from "./components/FileSection";
import { PrSummary } from "./components/PrSummary";
import { SettingsPanel } from "./components/SettingsPanel";
import { useScrollSync } from "./hooks/useScrollSync";
import { useTheme } from "./hooks/useTheme";

export function App() {
  const [prContext, setPrContextPayload] = useState<PrContextPayload | null>(
    null,
  );
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [commitSha, setCommitSha] = useState("");
  const [autoSync, setAutoSync] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [detail, setDetail] = useState<UiSettings["explanationDetail"]>(
    defaultSettings.ui.explanationDetail,
  );
  const [missingConfig, setMissingConfig] = useState<{
    apiKey: boolean;
    github: boolean;
  }>({ apiKey: false, github: false });
  useTheme();
  const visible = useScrollSync();

  const visibleFiles = new Set(visible.map((v) => v.file));

  useEffect(() => {
    async function checkConfig() {
      const [llmKey, ghToken] = await Promise.all([
        getSecret(SECRET_LLM_API_KEY),
        getSecret(SECRET_GITHUB_TOKEN),
      ]);
      setMissingConfig({ apiKey: !llmKey, github: !ghToken });
    }

    chrome.storage.local.get("settings").then((result) => {
      if (result.settings?.ui?.explanationDetail) {
        setDetail(result.settings.ui.explanationDetail);
      }
    });
    checkConfig();

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "session") {
        // Secrets changed in session storage -- recheck
        checkConfig();
      }
      if (changes.settings?.newValue) {
        if (changes.settings.newValue.ui?.explanationDetail) {
          setDetail(changes.settings.newValue.ui.explanationDetail);
        }
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, []);

  useEffect(() => {
    const listener = (message: unknown) => {
      if (!isMessage(message)) return;
      if (message.type === MessageType.ERROR) {
        setError(message.payload);
        return;
      }
      if (message.type === MessageType.PR_CONTEXT) {
        setError(null);
        setFiles([]);
        setCommitSha("");
        setPrContextPayload(message.payload);
        chrome.runtime
          .sendMessage(createMessage(MessageType.EXPLAIN_PR, message.payload))
          .catch(console.error);
      }
      if (message.type === MessageType.PR_CONTEXT_CLEAR) {
        setPrContextPayload(null);
        setFiles([]);
        setCommitSha("");
        setError(null);
        return;
      }
      if (message.type === MessageType.PR_DATA) {
        setCommitSha(message.payload.headSha);
        setFiles(message.payload.files);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    chrome.runtime
      .sendMessage(createMessage(MessageType.SIDE_PANEL_READY, {}))
      .catch(() => {});

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleDetectPr = () => {
    chrome.runtime
      .sendMessage(createMessage(MessageType.DETECT_PR, {}))
      .catch(console.error);
  };

  const handleReset = () => {
    setPrContextPayload(null);
    setFiles([]);
    setCommitSha("");
    setError(null);
  };

  const summaryCacheKey =
    prContext && commitSha
      ? makeCacheKey(prContext.prNumber, commitSha, PR_SUMMARY_KEY, detail)
      : null;

  if (showSettings) {
    return (
      <SettingsPanel
        onClose={() => setShowSettings(false)}
        autoSync={autoSync}
        onAutoSyncChange={setAutoSync}
      />
    );
  }

  if (error) {
    const handleErrorAction = async () => {
      if (error.category === "auth") {
        try {
          const resp = await chrome.runtime.sendMessage({
            type: "START_GITHUB_OAUTH",
          });
          if (resp?.success) {
            setError(null);
            if (prContext) {
              chrome.runtime
                .sendMessage(createMessage(MessageType.EXPLAIN_PR, prContext))
                .catch(console.error);
            }
          } else {
            setError({
              category: "auth",
              message:
                resp?.error ?? "Authentication failed. Please try again.",
            });
          }
        } catch {
          setError({
            category: "auth",
            message: "Authentication failed. Please try again.",
          });
        }
      } else if (error.category === "access") {
        window.open("https://github.com/settings/installations", "_blank");
      } else {
        // "Try again" — retry the current PR
        setError(null);
        if (prContext) {
          chrome.runtime
            .sendMessage(createMessage(MessageType.EXPLAIN_PR, prContext))
            .catch(console.error);
        }
      }
    };

    return (
      <ErrorState
        category={error.category}
        message={error.message}
        onAction={handleErrorAction}
        onSettingsClick={() => setShowSettings(true)}
        onRetry={() => {
          setError(null);
          if (prContext) {
            chrome.runtime
              .sendMessage(createMessage(MessageType.EXPLAIN_PR, prContext))
              .catch(console.error);
          }
        }}
      />
    );
  }

  if (!prContext) {
    return (
      <div class="hero-state animate-fade-up">
        <div class="hero-state-bg" />
        <div class="relative flex flex-col items-center text-center px-6 pt-14 pb-8">
          <div class="relative mb-6">
            <div class="absolute inset-0 hidden dark:block rounded-full bg-trail/15 blur-2xl scale-150" />
            <img
              src="/sherpa.png"
              alt="Sherpa"
              width={140}
              height={140}
              class="relative sherpa-float drop-shadow-lg"
            />
          </div>
          {missingConfig.apiKey || missingConfig.github ? (
            <>
              <p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed max-w-[240px] mb-4">
                A few things to set up before your first review.
              </p>
              <div class="w-full max-w-[260px] bg-white dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none divide-y divide-stone-100 dark:divide-stone-700 mb-5">
                <div class="flex items-center gap-2.5 p-3">
                  <span
                    class={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium ${missingConfig.apiKey ? "bg-trail-light text-trail-muted" : "bg-forest-light text-forest"}`}
                    role="img"
                    aria-label={missingConfig.apiKey ? "Step 1" : "Complete"}
                  >
                    {missingConfig.apiKey ? "1" : "\u2713"}
                  </span>
                  <span
                    class={`text-sm ${missingConfig.apiKey ? "text-stone-700 dark:text-stone-200" : "text-stone-400"}`}
                  >
                    Add an LLM API key
                  </span>
                </div>
                <div class="flex items-center gap-2.5 p-3">
                  <span
                    class={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium ${missingConfig.github ? "bg-trail-light text-trail-muted" : "bg-forest-light text-forest"}`}
                    role="img"
                    aria-label={missingConfig.github ? "Step 2" : "Complete"}
                  >
                    {missingConfig.github ? "2" : "\u2713"}
                  </span>
                  <span
                    class={`text-sm ${missingConfig.github ? "text-stone-700 dark:text-stone-200" : "text-stone-400"}`}
                  >
                    Connect GitHub
                  </span>
                </div>
              </div>
              <button
                type="button"
                class="hero-btn"
                onClick={() => setShowSettings(true)}
              >
                Open Settings
              </button>
            </>
          ) : (
            <>
              <p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed max-w-[240px] mb-6">
                Open a pull request, then tap below to evaluate it.
              </p>
              <button
                type="button"
                onClick={handleDetectPr}
                class="hero-btn group"
              >
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="transition-transform group-hover:rotate-12"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                Evaluate this PR
              </button>
              <button
                type="button"
                class="mt-4 text-[12px] text-stone-400 hover:text-stone-600 transition-colors font-medium"
                onClick={() => setShowSettings(true)}
              >
                Open Settings
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-col min-h-screen">
      <main class="flex-1 px-4 py-3 overflow-y-auto">
        <PrSummary
          cacheKey={summaryCacheKey}
          onSettingsClick={() => setShowSettings(true)}
          onReset={handleReset}
        />

        <div class="space-y-0.5">
          {files.map((file) => (
            <FileSection
              key={file.path}
              file={file}
              prNumber={prContext.prNumber}
              commitSha={commitSha}
              owner={prContext.owner}
              repo={prContext.repo}
              isVisible={visibleFiles.has(file.path)}
              autoSync={autoSync}
              detail={detail}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
