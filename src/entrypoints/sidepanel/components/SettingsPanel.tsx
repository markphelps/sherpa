import {
  ArrowLeft,
  BrainCircuit,
  CloudCog,
  Github,
  Heart,
  Monitor,
  Moon,
  Mountain,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchModels } from "@/utils/models";
import {
  getSecret,
  SECRET_GITHUB_TOKEN,
  SECRET_LLM_API_KEY,
  setSecret,
} from "@/utils/secure-storage";
import type { Settings, ThemePreference } from "@/utils/storage";
import { CACHE_PREFIX, defaultSettings } from "@/utils/storage";

const API_KEY_IDLE = "idle" as const;
const API_KEY_CHECKING = "checking" as const;
const API_KEY_VALID = "valid" as const;
const API_KEY_INVALID = "invalid" as const;
type ApiKeyStatus =
  | typeof API_KEY_IDLE
  | typeof API_KEY_CHECKING
  | typeof API_KEY_VALID
  | typeof API_KEY_INVALID;

const GH_LOADING = "loading" as const;
const GH_VALID = "valid" as const;
const GH_INVALID = "invalid" as const;
const GH_NONE = "none" as const;
type GitHubAuthStatus =
  | typeof GH_LOADING
  | typeof GH_VALID
  | typeof GH_INVALID
  | typeof GH_NONE;

interface Props {
  onClose: () => void;
  autoSync: boolean;
  onAutoSyncChange: (value: boolean) => void;
}

export function SettingsPanel({ onClose, autoSync, onAutoSyncChange }: Props) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus>(API_KEY_IDLE);
  const [ghStatus, setGhStatus] = useState<GitHubAuthStatus>(GH_LOADING);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const validateIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    async function loadSettings() {
      const result = await chrome.storage.local.get("settings");
      if (result.settings) {
        setSettings(result.settings);
        // Don't set default models — wait for API key validation
      }

      // Load API key from secure storage
      const storedApiKey = await getSecret(SECRET_LLM_API_KEY);
      if (storedApiKey) {
        setApiKey(storedApiKey);
        const provider =
          result.settings?.llm?.provider ?? defaultSettings.llm.provider;
        validateKey(provider, storedApiKey);
      }

      // Validate GitHub token from secure storage
      const ghToken = await getSecret(SECRET_GITHUB_TOKEN);
      if (ghToken) {
        fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: "application/vnd.github+json",
          },
        })
          .then((r) => {
            if (r.ok) setGhStatus(GH_VALID);
            else if (r.status === 401) setGhStatus(GH_INVALID);
            else setGhStatus(GH_VALID); // rate-limited or transient — don't invalidate
          })
          .catch(() => setGhStatus(GH_VALID)); // network error — don't invalidate
      } else {
        setGhStatus(GH_NONE);
      }
    }
    loadSettings();
  }, []);

  const validateKey = useCallback(
    (provider: Settings["llm"]["provider"], apiKey: string) => {
      if (!apiKey) {
        setKeyStatus(API_KEY_IDLE);
        setModels([]);
        return;
      }
      const id = ++validateIdRef.current;
      setKeyStatus(API_KEY_CHECKING);
      fetchModels(provider, apiKey).then((result) => {
        if (id !== validateIdRef.current) return; // stale response
        setKeyStatus(result.valid ? API_KEY_VALID : API_KEY_INVALID);
        if (result.valid) {
          setModels(result.models);
          // Auto-select first model if current selection is empty or not in list
          setSettings((prev) => {
            const currentModel = prev.llm.model;
            if (!currentModel || !result.models.includes(currentModel)) {
              const updated = {
                ...prev,
                llm: { ...prev.llm, model: result.models[0] },
              };
              chrome.storage.local.set({ settings: updated });
              return updated;
            }
            return prev;
          });
        } else {
          setModels([]);
        }
      });
    },
    [],
  );

  async function handleApiKeyChange(newKey: string, currentSettings: Settings) {
    setApiKey(newKey);
    await setSecret(SECRET_LLM_API_KEY, newKey || null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!newKey) {
      setKeyStatus(API_KEY_IDLE);
      setModels([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      validateKey(currentSettings.llm.provider, newKey);
    }, 500);
  }

  function handleProviderChange(provider: Settings["llm"]["provider"]) {
    setModels([]);
    setKeyStatus(API_KEY_IDLE);
    setApiKey("");
    setSecret(SECRET_LLM_API_KEY, null);
    setSettings((prev) => {
      const updated = {
        ...prev,
        llm: { ...prev.llm, provider, model: "" },
      };
      chrome.storage.local.set({ settings: updated });
      return updated;
    });
  }

  async function save(updated: Settings) {
    setSettings(updated);
    await chrome.storage.local.set({ settings: updated });
  }

  return (
    <div class="min-h-screen bg-stone-50 dark:bg-[#1a1917] animate-fade-up">
      {/* Header */}
      <header class="sticky top-0 z-10 bg-stone-50/90 dark:bg-[#1a1917]/90 backdrop-blur-sm border-b border-stone-200 dark:border-stone-700 px-4 py-3">
        <div class="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            class="text-stone-400 hover:text-stone-600 transition-colors p-0.5 -ml-0.5"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <SettingsIcon size={15} className="text-trail" />
          <h2 class="text-base font-semibold tracking-tight text-stone-800 dark:text-stone-100">
            Settings
          </h2>
        </div>
      </header>

      <div class="px-4 py-4 space-y-6">
        {/* LLM Provider */}
        <fieldset>
          <legend class="flex items-center gap-1.5 mb-2.5">
            <BrainCircuit size={14} className="text-stone-500" />
            <span class="text-[13px] font-medium text-stone-500 uppercase tracking-wider">
              LLM Provider
            </span>
          </legend>
          <div class="bg-white dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none divide-y divide-stone-100 dark:divide-stone-700 focus-within:ring-1 focus-within:ring-trail/30">
            <div class="p-3">
              <select
                aria-label="LLM Provider"
                class="w-full bg-transparent text-sm text-stone-800 dark:text-stone-200 focus:outline-none cursor-pointer transition-colors"
                value={settings.llm.provider}
                onChange={(e) =>
                  handleProviderChange(
                    (e.target as HTMLSelectElement)
                      .value as Settings["llm"]["provider"],
                  )
                }
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
              </select>
            </div>
            <div class="p-3">
              <div class="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="API Key"
                  aria-label="API key"
                  class="flex-1 bg-transparent text-sm text-stone-800 dark:text-stone-200 placeholder:text-stone-300 dark:placeholder:text-stone-600 focus:outline-none"
                  value={apiKey}
                  onInput={(e) =>
                    handleApiKeyChange(
                      (e.target as HTMLInputElement).value,
                      settings,
                    )
                  }
                />
                {keyStatus === API_KEY_CHECKING && (
                  <output
                    class="block w-3.5 h-3.5 border-2 border-stone-300 border-t-trail rounded-full animate-spin shrink-0"
                    aria-label="Validating API key"
                  ></output>
                )}
                {keyStatus === API_KEY_VALID && (
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    class="text-forest shrink-0"
                  >
                    <path d="M2 6.5l2.5 2.5L10 3" />
                  </svg>
                )}
                {keyStatus === API_KEY_INVALID && (
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    class="text-ridge shrink-0"
                  >
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                )}
              </div>
            </div>
            {models.length > 0 ? (
              <div class="p-3">
                <select
                  aria-label="Model"
                  class="w-full bg-transparent text-sm text-stone-800 dark:text-stone-200 focus:outline-none cursor-pointer font-mono transition-colors"
                  value={settings.llm.model}
                  onChange={(e) =>
                    save({
                      ...settings,
                      llm: {
                        ...settings.llm,
                        model: (e.target as HTMLSelectElement).value,
                      },
                    })
                  }
                >
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div class="p-3">
                <span class="text-sm text-stone-400 italic">
                  {keyStatus === API_KEY_CHECKING
                    ? "Fetching models..."
                    : "Enter a valid API key to load models"}
                </span>
              </div>
            )}
          </div>
          <p class="text-xs text-stone-500 mt-1.5 px-0.5">
            Your API key is sent directly from your browser to the provider. It
            is stored locally and never passes through any intermediary server.
          </p>
        </fieldset>

        {/* GitHub */}
        <fieldset>
          <legend class="flex items-center gap-1.5 mb-2.5">
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              class="text-stone-500"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span class="text-[13px] font-medium text-stone-500 uppercase tracking-wider">
              GitHub
            </span>
          </legend>
          <div class="bg-white dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none p-3">
            {ghStatus === GH_LOADING ? (
              <div class="flex items-center gap-2 text-sm text-stone-400">
                <div class="w-3.5 h-3.5 border-2 border-stone-300 border-t-trail rounded-full animate-spin shrink-0" />
                Checking...
              </div>
            ) : ghStatus === GH_VALID ? (
              <div class="flex items-center justify-between">
                <div
                  class={`flex items-center gap-2 text-sm ${reauthing ? "text-stone-400" : "text-forest"}`}
                >
                  {reauthing ? (
                    <div class="w-3.5 h-3.5 border-2 border-stone-300 border-t-trail rounded-full animate-spin shrink-0" />
                  ) : (
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path d="M2 6.5l2.5 2.5L10 3" />
                    </svg>
                  )}
                  {reauthing ? "Authenticating..." : "Authenticated"}
                </div>
                <button
                  type="button"
                  disabled={reauthing}
                  class={`text-xs underline underline-offset-2 transition-colors ${
                    reauthing
                      ? "text-stone-300 decoration-stone-200 cursor-default"
                      : "text-stone-400 hover:text-stone-600 decoration-stone-300 hover:decoration-stone-500"
                  }`}
                  onClick={async () => {
                    setReauthing(true);
                    try {
                      const resp = await chrome.runtime.sendMessage({
                        type: "START_GITHUB_OAUTH",
                      });
                      if (resp?.success) {
                        setGhStatus(GH_VALID);
                      } else {
                        setGhStatus(GH_INVALID);
                      }
                    } catch {
                      setGhStatus(GH_INVALID);
                    } finally {
                      setReauthing(false);
                    }
                  }}
                >
                  Re-authenticate
                </button>
              </div>
            ) : (
              <div>
                {ghStatus === GH_INVALID && (
                  <p class="text-xs text-ridge mb-2">
                    Token expired or revoked
                  </p>
                )}
                <button
                  type="button"
                  class="w-full inline-flex items-center justify-center gap-2 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-800 text-sm font-medium px-3 py-2.5 rounded-md hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
                  onClick={async () => {
                    try {
                      const resp = await chrome.runtime.sendMessage({
                        type: "START_GITHUB_OAUTH",
                      });
                      if (resp?.success) {
                        setGhStatus(GH_VALID);
                      }
                    } catch {
                      setGhStatus(GH_INVALID);
                    }
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  {ghStatus === GH_INVALID
                    ? "Re-authenticate with GitHub"
                    : "Sign in with GitHub"}
                </button>
              </div>
            )}
          </div>
        </fieldset>

        {/* API */}
        <fieldset>
          <legend class="flex items-center gap-1.5 mb-2.5">
            <CloudCog size={14} className="text-stone-500" />
            <span class="text-[13px] font-medium text-stone-500 uppercase tracking-wider">
              API
            </span>
          </legend>
          <div class="bg-white dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none focus-within:ring-1 focus-within:ring-trail/30">
            <div class="p-3">
              <input
                type="url"
                placeholder="https://your-worker.workers.dev"
                aria-label="Worker URL"
                class="w-full bg-transparent text-sm text-stone-800 dark:text-stone-200 placeholder:text-stone-300 dark:placeholder:text-stone-600 focus:outline-none font-mono"
                value={settings.workerUrl}
                onInput={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  if (
                    val === "" ||
                    /^https?:\/\//i.test(val)
                  ) {
                    save({ ...settings, workerUrl: val });
                  }
                }}
              />
            </div>
          </div>
          <p class="text-xs text-stone-500 mt-1.5 px-0.5">
            Backend server for authentication and caching.
          </p>
        </fieldset>

        {/* Preferences */}
        <fieldset>
          <legend class="flex items-center gap-1.5 mb-2.5">
            <SettingsIcon size={14} className="text-stone-500" />
            <span class="text-[13px] font-medium text-stone-500 uppercase tracking-wider">
              Preferences
            </span>
          </legend>
          <div class="bg-white dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none divide-y divide-stone-100 dark:divide-stone-700">
            {/* Scroll Sync */}
            <label class="flex items-center justify-between p-3 cursor-pointer group">
              <div>
                <div class="text-sm text-stone-800 dark:text-stone-200">
                  Scroll sync
                </div>
                <div class="text-xs text-stone-500 mt-0.5">
                  Follow your position in the diff
                </div>
              </div>
              <div class="relative shrink-0 ml-3">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) =>
                    onAutoSyncChange((e.target as HTMLInputElement).checked)
                  }
                  class="sr-only peer"
                />
                <div class="w-9 h-[20px] bg-stone-300 dark:bg-stone-600 rounded-full peer-checked:bg-trail transition-colors" />
                <div class="absolute left-0.5 top-[3px] w-3.5 h-3.5 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform" />
              </div>
            </label>

            {/* Theme */}
            <div class="p-3">
              <div class="text-sm text-stone-800 dark:text-stone-200 mb-3">
                Theme
              </div>
              <div class="flex justify-around items-end">
                {(
                  [
                    {
                      mode: "system" as ThemePreference,
                      label: "System",
                      icon: Monitor,
                    },
                    {
                      mode: "light" as ThemePreference,
                      label: "Light",
                      icon: Sun,
                    },
                    {
                      mode: "dark" as ThemePreference,
                      label: "Dark",
                      icon: Moon,
                    },
                  ] as const
                ).map(({ mode, label, icon: Icon }) => {
                  const active = (settings.ui.theme ?? "system") === mode;
                  return (
                    <button
                      type="button"
                      key={mode}
                      class="flex flex-col items-center gap-1.5 group"
                      onClick={() =>
                        save({
                          ...settings,
                          ui: { ...settings.ui, theme: mode },
                        })
                      }
                    >
                      <Icon
                        size={28}
                        className={`transition-colors ${active ? "text-trail" : "text-stone-300 dark:text-stone-500 group-hover:text-stone-400 dark:group-hover:text-stone-300"}`}
                      />
                      <span
                        class={`text-xs transition-colors ${
                          active
                            ? "text-trail-muted dark:text-trail font-medium"
                            : "text-stone-400 dark:text-stone-500"
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detail Level — Mountain Selector */}
            <div class="p-3">
              <div class="text-sm text-stone-800 dark:text-stone-200 mb-3">
                Detail level
              </div>
              <div class="flex justify-around items-end">
                {[
                  { level: "concise" as const, label: "Concise", size: 24 },
                  { level: "balanced" as const, label: "Balanced", size: 32 },
                  { level: "detailed" as const, label: "Detailed", size: 40 },
                ].map(({ level, label, size }) => {
                  const active = settings.ui.explanationDetail === level;
                  return (
                    <button
                      type="button"
                      key={level}
                      class="flex flex-col items-center gap-1.5 group"
                      onClick={async () => {
                        if (settings.ui.explanationDetail !== level) {
                          const all = await chrome.storage.local.get(null);
                          const cacheKeys = Object.keys(all).filter((k) =>
                            k.startsWith(CACHE_PREFIX),
                          );
                          if (cacheKeys.length > 0)
                            await chrome.storage.local.remove(cacheKeys);
                        }
                        save({
                          ...settings,
                          ui: { ...settings.ui, explanationDetail: level },
                        });
                      }}
                    >
                      <Mountain
                        size={size}
                        className={`transition-colors ${active ? "text-trail" : "text-stone-300 group-hover:text-stone-400"}`}
                      />
                      <span
                        class={`text-xs transition-colors ${
                          active
                            ? "text-trail-muted font-medium"
                            : "text-stone-400"
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Max File Size — notched slider */}
            {(() => {
              const STEPS = [25, 50, 100, 200, 300, 500];
              const maxIdx = STEPS.length - 1;
              const currentBytes =
                settings.ui.maxFileSize ?? defaultSettings.ui.maxFileSize;
              const currentKB = Math.round(currentBytes / 1000);
              const found = STEPS.indexOf(currentKB);
              const activeIndex = found !== -1 ? found : 2;
              return (
                <div class="p-3">
                  <div class="flex items-center justify-between mb-3">
                    <div class="text-sm text-stone-800 dark:text-stone-200">
                      File size limit
                    </div>
                    <span class="text-xs font-mono text-trail-muted tabular-nums font-medium">
                      {STEPS[activeIndex]}KB
                    </span>
                  </div>
                  {/* Slider track with notches */}
                  <div class="relative h-3 mx-1">
                    {/* Background track */}
                    <div class="absolute top-[5px] left-0 right-0 h-[3px] bg-stone-200 dark:bg-stone-600 rounded-full" />
                    {/* Filled track */}
                    <div
                      class="absolute top-[5px] left-0 h-[3px] bg-trail rounded-full transition-all duration-100"
                      style={{ width: `${(activeIndex / maxIdx) * 100}%` }}
                    />
                    {/* Notch dots */}
                    {STEPS.map((_, i) => (
                      <div
                        key={i}
                        class={`absolute top-[4px] w-[5px] h-[5px] rounded-full -ml-[2.5px] transition-colors duration-100 ${
                          i <= activeIndex ? "bg-trail" : "bg-stone-300"
                        }`}
                        style={{ left: `${(i / maxIdx) * 100}%` }}
                      />
                    ))}
                    {/* Thumb */}
                    <div
                      class="absolute top-[1px] w-[11px] h-[11px] -ml-[5.5px] rounded-full bg-trail border-2 border-white shadow-sm transition-all duration-100"
                      style={{ left: `${(activeIndex / maxIdx) * 100}%` }}
                    />
                    {/* Invisible native range for drag + snap */}
                    <input
                      type="range"
                      aria-label="File size limit"
                      min={0}
                      max={maxIdx}
                      step={1}
                      value={activeIndex}
                      onInput={(e) => {
                        const idx = parseInt(
                          (e.target as HTMLInputElement).value,
                          10,
                        );
                        save({
                          ...settings,
                          ui: {
                            ...settings.ui,
                            maxFileSize: STEPS[idx] * 1000,
                          },
                        });
                      }}
                      class="absolute inset-0 w-full opacity-0 cursor-pointer"
                    />
                  </div>
                  {/* Labels row */}
                  <div class="flex justify-between mx-1 mt-2">
                    {STEPS.map((kb, i) => (
                      <span
                        key={kb}
                        class={`text-xs font-mono tabular-nums ${
                          i === activeIndex
                            ? "text-trail-muted font-medium"
                            : "text-stone-300"
                        }`}
                      >
                        {kb}
                      </span>
                    ))}
                  </div>
                  <p class="text-xs text-stone-500 mt-2.5">
                    Files larger than this are truncated before analysis
                  </p>
                </div>
              );
            })()}
          </div>
        </fieldset>

        {/* Debug */}
        <fieldset>
          <legend class="flex items-center gap-1.5 mb-2.5">
            <Wrench size={14} className="text-stone-500" />
            <span class="text-[13px] font-medium text-stone-500 uppercase tracking-wider">
              Debug
            </span>
          </legend>
          <div class="bg-white dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-none">
            <div class="flex items-center justify-between p-3">
              <div>
                <div class="text-sm text-stone-800 dark:text-stone-200">
                  Clear cache
                </div>
                <div class="text-xs text-stone-500 mt-0.5">
                  Clear explanations cached in the browser
                </div>
              </div>
              <button
                type="button"
                disabled={cacheCleared}
                class={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all duration-200 ${
                  cacheCleared
                    ? "bg-forest-light text-forest cursor-default"
                    : "bg-stone-100 text-stone-600 hover:bg-ridge-light hover:text-ridge active:scale-95"
                }`}
                onClick={async () => {
                  const all = await chrome.storage.local.get(null);
                  const cacheKeys = Object.keys(all).filter((k) =>
                    k.startsWith(CACHE_PREFIX),
                  );
                  if (cacheKeys.length > 0)
                    await chrome.storage.local.remove(cacheKeys);
                  setCacheCleared(true);
                  setTimeout(() => setCacheCleared(false), 2000);
                }}
              >
                {cacheCleared ? (
                  <>
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path d="M2 6.5l2.5 2.5L10 3" />
                    </svg>
                    Cleared
                  </>
                ) : (
                  <>
                    <Trash2 size={12} />
                    Clear
                  </>
                )}
              </button>
            </div>
          </div>
        </fieldset>

        {/* Built by */}
        <div class="pt-2 pb-4">
          <div class="flex flex-col items-center gap-3 text-center">
            <div class="flex items-center gap-1.5 text-xs text-stone-400">
              <span>Packed with</span>
              <Heart size={12} className="text-ridge" />
              <span>by Mark Phelps</span>
            </div>
            <div class="flex items-center gap-3">
              <a
                href="https://x.com/mark_a_phelps"
                target="_blank"
                rel="noopener noreferrer"
                class="text-stone-400 hover:text-stone-600 transition-colors"
                aria-label="@mark_a_phelps on X"
              >
                <span class="sr-only">@mark_a_phelps on X</span>
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://github.com/markphelps"
                target="_blank"
                rel="noopener noreferrer"
                class="text-stone-400 hover:text-stone-600 transition-colors"
                aria-label="markphelps on GitHub"
              >
                <Github size={14} />
              </a>
              <a
                href="https://markphelps.me"
                target="_blank"
                rel="noopener noreferrer"
                class="text-stone-400 hover:text-stone-600 transition-colors text-xs font-medium underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500"
                title="markphelps.me"
              >
                markphelps.me
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
