import type { DOMAdapter, FileElement } from "@/providers/types";
import {
  createMessage,
  MessageType,
  type VisibleHunk,
} from "@/utils/messaging";

export function setupScrollObserver(adapter: DOMAdapter): () => void {
  const visible = new Map<string, VisibleHunk>();
  let debounceTimer: ReturnType<typeof setTimeout>;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target;
        const file = el.getAttribute("data-sherpa-file") ?? "";
        const hunk = parseInt(el.getAttribute("data-sherpa-hunk") ?? "-1", 10);
        const key = `${file}:${hunk}`;

        if (entry.isIntersecting) {
          visible.set(key, { file, hunk });
        } else {
          visible.delete(key);
        }
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        chrome.runtime
          .sendMessage(
            createMessage(MessageType.VISIBLE_HUNKS, {
              visible: Array.from(visible.values()),
            }),
          )
          .catch(() => {});
      }, 150);
    },
    { threshold: 0.3 },
  );

  function observeFile(file: FileElement): void {
    // Tag the file element
    file.element.setAttribute("data-sherpa-file", file.path);
    file.element.setAttribute("data-sherpa-hunk", "-1");
    observer.observe(file.element);

    // Tag and observe each hunk
    const hunks = adapter.getHunkElements(file);
    for (const hunk of hunks) {
      hunk.element.setAttribute("data-sherpa-file", file.path);
      hunk.element.setAttribute("data-sherpa-hunk", String(hunk.index));
      observer.observe(hunk.element);
    }
  }

  // Observe existing files
  for (const file of adapter.getFileElements()) {
    observeFile(file);
  }

  // Observe dynamically loaded files
  const cleanupNewFiles = adapter.observeNewFiles(observeFile);

  return () => {
    clearTimeout(debounceTimer);
    observer.disconnect();
    cleanupNewFiles();
  };
}
