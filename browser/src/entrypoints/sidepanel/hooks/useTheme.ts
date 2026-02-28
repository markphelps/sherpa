import { useEffect, useState } from "preact/hooks";
import { defaultSettings, type ThemePreference } from "@/utils/storage";

/**
 * Applies the theme preference to the document root element.
 * Listens for storage changes and system color scheme changes.
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>(defaultSettings.ui.theme);

  // Load saved theme preference
  useEffect(() => {
    chrome.storage.local.get("settings").then((result) => {
      if (result.settings?.ui?.theme) {
        setTheme(result.settings.ui.theme);
      }
    });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "local" && changes.settings?.newValue?.ui?.theme) {
        setTheme(changes.settings.newValue.ui.theme);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Apply the resolved theme class to <html>
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const isDark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", isDark);
    }

    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  return theme;
}
