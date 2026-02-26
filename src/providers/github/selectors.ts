// Centralized selectors for GitHub's diff view.
// When GitHub changes their DOM, update ONLY this file.
//
// GitHub has two diff UIs: the beta (progressive diffs with React modules)
// and legacy (classic server-rendered HTML). We detect which is active and
// expose the matching selectors through getSelectors().

interface SelectorSet {
  diffContainer: string;
  fileContainer: string;
  diffTable: string;
  hunkHeader: string;
  /** Extracts the file path from a file container element. */
  getFilePath: (fileEl: Element) => string;
}

const BETA_SELECTORS: SelectorSet = {
  diffContainer: '[data-testid="progressive-diffs-list"]',
  fileContainer: 'div[id^="diff-"][class*="Diff-module__diff"]',
  diffTable: "table[data-diff-anchor]",
  hunkHeader: "td.diff-hunk-cell",
  getFilePath: (el) =>
    el.querySelector("[data-file-path]")?.getAttribute("data-file-path") ??
    "unknown",
};

const LEGACY_SELECTORS: SelectorSet = {
  diffContainer: "#files",
  fileContainer: ".file",
  diffTable: "table[data-diff-anchor]",
  hunkHeader: "td.blob-code-hunk",
  getFilePath: (el) =>
    el.querySelector(".file-header")?.getAttribute("data-path") ?? "unknown",
};

/** Detects which GitHub diff UI is active and returns the appropriate selectors. */
export function getSelectors(): SelectorSet {
  if (document.querySelector(BETA_SELECTORS.diffContainer)) {
    return BETA_SELECTORS;
  }
  return LEGACY_SELECTORS;
}

/** Back-compat export — prefer getSelectors() for runtime use. */
export const SELECTORS = BETA_SELECTORS;

export function validateSelectors(): string[] {
  const selectors = getSelectors();
  const missing: string[] = [];
  const diffContainer = document.querySelector(selectors.diffContainer);
  if (!diffContainer) missing.push("diffContainer");

  const files = document.querySelectorAll(selectors.fileContainer);
  if (files.length === 0) missing.push("fileContainer (none found)");

  return missing;
}
