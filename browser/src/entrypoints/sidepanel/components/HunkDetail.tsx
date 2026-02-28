import { useState } from "preact/hooks";
import { useExplanation } from "@/entrypoints/sidepanel/hooks/useExplanation";
import type { ChangedFile, Hunk } from "@/providers/types";
import { createMessage, MessageType } from "@/utils/messaging";
import { makeCacheKey, type UiSettings } from "@/utils/storage";
import { Markdown } from "./Markdown";
import { Skeleton } from "./Skeleton";

interface Props {
  hunk: Hunk;
  file: ChangedFile;
  prNumber: number;
  commitSha: string;
  owner: string;
  repo: string;
  detail: UiSettings["explanationDetail"];
}

export function HunkDetail({
  hunk,
  file,
  prNumber,
  commitSha,
  owner,
  repo,
  detail,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [requested, setRequested] = useState(false);
  const cacheKey = requested
    ? makeCacheKey(prNumber, commitSha, file.path, detail, hunk.index)
    : null;
  const { text, loading, streaming, error } = useExplanation(cacheKey);

  function handleExpand() {
    setExpanded(!expanded);
    if (!requested) {
      setRequested(true);
      chrome.runtime
        .sendMessage(
          createMessage(MessageType.EXPLAIN_HUNK, {
            owner,
            repo,
            prNumber,
            filePath: file.path,
            commitSha,
            hunkIndex: hunk.index,
          }),
        )
        .catch(console.error);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleExpand}
        aria-expanded={expanded}
        class="flex items-center gap-1.5 w-full text-left text-xs font-mono text-stone-400 hover:text-stone-600 py-1 px-1.5 -mx-1.5 rounded hover:bg-stone-100/40 dark:hover:bg-stone-700/40 transition-colors duration-150"
      >
        <svg
          aria-hidden="true"
          class={`shrink-0 w-2.5 h-2.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M4.5 2.5L8 6L4.5 9.5" />
        </svg>
        <span class="truncate">
          L{hunk.startLine}–{hunk.endLine}
        </span>
      </button>
      {expanded && (
        <div class="ml-4 mt-1 mb-1.5 animate-fade-up">
          {error ? (
            <p class="text-[13px] text-ridge">{error}</p>
          ) : loading || (!text && requested) ? (
            <Skeleton />
          ) : text ? (
            <Markdown
              text={text}
              streaming={streaming}
              class="text-[13px] text-stone-500 dark:text-stone-300"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
