import { useState } from "preact/hooks";
import { useExplanation } from "@/entrypoints/sidepanel/hooks/useExplanation";
import type { ChangedFile } from "@/providers/types";
import { isGeneratedFile } from "@/utils/generated-files";
import { createMessage, MessageType } from "@/utils/messaging";
import { makeCacheKey, type UiSettings } from "@/utils/storage";
import { HunkDetail } from "./HunkDetail";
import { Markdown } from "./Markdown";
import { Skeleton } from "./Skeleton";

interface Props {
  file: ChangedFile;
  prNumber: number;
  commitSha: string;
  owner: string;
  repo: string;
  isVisible: boolean;
  autoSync: boolean;
  detail: UiSettings["explanationDetail"];
}

function statusBadge(status: ChangedFile["status"]) {
  switch (status) {
    case "added":
      return {
        label: "A",
        fullLabel: "Added",
        cls: "bg-forest-light text-forest",
      };
    case "removed":
      return {
        label: "D",
        fullLabel: "Deleted",
        cls: "bg-ridge-light text-ridge",
      };
    case "renamed":
      return {
        label: "R",
        fullLabel: "Renamed",
        cls: "bg-summit-light text-summit",
      };
    default:
      return {
        label: "M",
        fullLabel: "Modified",
        cls: "bg-trail-light text-trail-muted",
      };
  }
}

export function FileSection({
  file,
  prNumber,
  commitSha,
  owner,
  repo,
  isVisible,
  autoSync,
  detail,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [requested, setRequested] = useState(false);
  const cacheKey = requested
    ? makeCacheKey(prNumber, commitSha, file.path, detail)
    : null;
  const { text, loading, streaming, error } = useExplanation(cacheKey);

  const generated = isGeneratedFile(file.path);
  const shouldExpand = expanded || (autoSync && isVisible && !generated);
  const badge = statusBadge(file.status);
  const fileName = file.path.split("/").pop() ?? file.path;
  const dirPath = file.path.includes("/")
    ? file.path.slice(0, file.path.lastIndexOf("/") + 1)
    : "";

  function handleExpand() {
    setExpanded(!expanded);
    if (!requested) {
      setRequested(true);
      chrome.runtime
        .sendMessage(
          createMessage(MessageType.EXPLAIN_FILE, {
            owner,
            repo,
            prNumber,
            filePath: file.path,
            commitSha,
          }),
        )
        .catch(console.error);
    }
  }

  return (
    <div
      class={`contour-line ${isVisible ? "contour-line-active" : ""} pl-3 py-1.5 transition-colors duration-200`}
    >
      <button
        type="button"
        onClick={handleExpand}
        aria-expanded={shouldExpand}
        class="flex items-center gap-2 w-full text-left group py-1 rounded-md hover:bg-stone-100/60 dark:hover:bg-stone-700/40 px-1.5 -mx-1.5 transition-colors duration-150"
      >
        <span
          class={`shrink-0 text-[10px] font-mono font-medium px-1 py-0.5 rounded ${badge.cls}`}
          role="img"
          aria-label={badge.fullLabel}
        >
          {badge.label}
        </span>
        <span class="truncate text-sm">
          <span class="text-stone-400">{dirPath}</span>
          <span class="font-medium text-stone-700 dark:text-stone-200">
            {fileName}
          </span>
        </span>
        {generated && (
          <span
            class="shrink-0 text-[10px] font-mono px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-700 text-stone-400"
            title="Generated/lock file — skipped during auto-expand"
          >
            gen
          </span>
        )}
        <span class="ml-auto shrink-0 text-[11px] font-mono text-stone-400 tabular-nums">
          <span class="text-forest">+{file.additions}</span>
          <span class="mx-0.5">/</span>
          <span class="text-ridge">-{file.deletions}</span>
        </span>
        <svg
          aria-hidden="true"
          class={`shrink-0 w-3 h-3 text-stone-400 transition-transform duration-200 ${shouldExpand ? "rotate-90" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path d="M4.5 2.5L8 6L4.5 9.5" />
        </svg>
      </button>

      {shouldExpand && (
        <div class="mt-1.5 ml-1 animate-fade-up">
          {error ? (
            <div class="bg-ridge-light/50 rounded-md border border-ridge/20 p-3 mb-2">
              <p class="text-sm text-ridge">{error}</p>
            </div>
          ) : loading || (!text && requested) ? (
            <Skeleton />
          ) : text ? (
            <div class="bg-white dark:bg-stone-800/50 rounded-md border border-stone-200 dark:border-stone-700 p-3 mb-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:shadow-none">
              <Markdown
                text={text}
                streaming={streaming}
                class="text-sm text-stone-600 dark:text-stone-300"
              />
            </div>
          ) : null}

          {file.hunks.length > 0 && (
            <div class="space-y-0.5">
              {file.hunks.map((hunk) => (
                <HunkDetail
                  key={hunk.index}
                  hunk={hunk}
                  file={file}
                  prNumber={prNumber}
                  commitSha={commitSha}
                  owner={owner}
                  repo={repo}
                  detail={detail}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
