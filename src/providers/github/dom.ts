import type { DOMAdapter, FileElement, HunkElement } from "@/providers/types";
import { getSelectors } from "./selectors";

export class GitHubDOMAdapter implements DOMAdapter {
  getFileElements(): FileElement[] {
    const selectors = getSelectors();
    const elements = document.querySelectorAll(selectors.fileContainer);
    return Array.from(elements).map((el) => ({
      path: selectors.getFilePath(el),
      element: el,
    }));
  }

  getHunkElements(file: FileElement): HunkElement[] {
    const selectors = getSelectors();
    const headers = file.element.querySelectorAll(selectors.hunkHeader);
    return Array.from(headers).map((el, index) => ({
      index,
      header: el.textContent?.trim() ?? "",
      element: el.closest("tr") ?? el,
    }));
  }

  observeNewFiles(callback: (file: FileElement) => void): () => void {
    const selectors = getSelectors();
    const container =
      document.querySelector(selectors.diffContainer) ?? document.body;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            if (node.matches(selectors.fileContainer)) {
              callback({
                path: selectors.getFilePath(node),
                element: node,
              });
            }
            node.querySelectorAll(selectors.fileContainer).forEach((el) => {
              callback({
                path: selectors.getFilePath(el),
                element: el,
              });
            });
          }
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  parseUrlContext(
    url: string,
  ): { owner: string; repo: string; prId: string } | null {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], prId: match[3] };
  }
}
