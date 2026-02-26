import { GitHubDOMAdapter } from "@/providers/github/dom";
import { validateSelectors } from "@/providers/github/selectors";
import { createMessage, MessageType } from "@/utils/messaging";
import { setupScrollObserver } from "./scroll";

export default defineContentScript({
  matches: [
    "https://github.com/*/*/pull/*/files*",
    "https://github.com/*/*/pull/*/changes*",
  ],
  main() {
    console.log("Sherpa content script loaded");

    const adapter = new GitHubDOMAdapter();
    const context = adapter.parseUrlContext(window.location.href);
    if (!context) return;

    // Validate selectors
    const missing = validateSelectors();
    if (missing.length > 0) {
      console.warn("Sherpa: some selectors not found:", missing);
    }

    // Notify background of PR context
    chrome.runtime
      .sendMessage(
        createMessage(MessageType.PR_CONTEXT, {
          owner: context.owner,
          repo: context.repo,
          prNumber: parseInt(context.prId, 10),
        }),
      )
      .catch(() => {});

    // Set up scroll observation
    const cleanup = setupScrollObserver(adapter);

    // Handle SPA navigation away from this PR
    const handleNavigation = () => {
      const newContext = adapter.parseUrlContext(window.location.href);
      if (!newContext || newContext.prId !== context.prId) {
        cleanup();
      }
    };

    window.addEventListener("popstate", handleNavigation);
    document.addEventListener("turbo:load", handleNavigation);
  },
});
