import { useEffect, useState } from "preact/hooks";
import { isMessage, MessageType } from "@/utils/messaging";
import { CACHE_PREFIX } from "@/utils/storage";

interface ExplanationState {
  text: string;
  loading: boolean;
  streaming: boolean;
  error: string | null;
}

export function useExplanation(cacheKey: string | null): ExplanationState {
  const [state, setState] = useState<ExplanationState>({
    text: "",
    loading: false,
    streaming: false,
    error: null,
  });

  useEffect(() => {
    if (!cacheKey) {
      setState({ text: "", loading: false, streaming: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    let resolved = false;
    const storageKey = CACHE_PREFIX + cacheKey;

    const checkCache = () => {
      chrome.storage.local.get(storageKey).then((result) => {
        const entry = result[storageKey];
        if (entry?.text && !resolved) {
          resolved = true;
          setState({
            text: entry.text,
            loading: false,
            streaming: false,
            error: null,
          });
        }
      });
    };

    // Check cache immediately when key becomes available
    checkCache();

    const listener = (message: unknown) => {
      if (!isMessage(message)) return;

      // Surface global errors so the loading state doesn't hang
      if (message.type === MessageType.ERROR && !resolved) {
        setState((prev) =>
          prev.loading
            ? {
                text: "",
                loading: false,
                streaming: false,
                error: message.payload.message,
              }
            : prev,
        );
        return;
      }

      if (message.type !== MessageType.EXPLANATION_RESULT) return;
      const { key, text, streaming } = message.payload;
      if (key !== cacheKey) return;
      if (resolved && !streaming) return;
      resolved = !streaming;
      setState({ text, loading: false, streaming, error: null });
    };

    chrome.runtime.onMessage.addListener(listener);

    // Listen for cache writes that may arrive after initial check (race condition)
    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (changes[storageKey]?.newValue?.text && !resolved) {
        resolved = true;
        setState({
          text: changes[storageKey].newValue.text,
          loading: false,
          streaming: false,
          error: null,
        });
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [cacheKey]);

  return state;
}
