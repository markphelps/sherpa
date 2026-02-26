import { Compass, Settings, X } from "lucide-react";
import { useExplanation } from "@/entrypoints/sidepanel/hooks/useExplanation";
import { Markdown } from "./Markdown";
import { Skeleton } from "./Skeleton";

interface Props {
  cacheKey: string | null;
  onSettingsClick?: () => void;
  onReset?: () => void;
}

export function PrSummary({ cacheKey, onSettingsClick, onReset }: Props) {
  const { text, loading, streaming, error } = useExplanation(cacheKey);

  return (
    <section class="mb-4 animate-fade-up">
      <div class="flex items-center gap-2 mb-2">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            class="text-stone-400 hover:text-stone-600 transition-colors p-0.5 -ml-0.5"
            aria-label="Clear and evaluate a different PR"
          >
            <X size={16} />
          </button>
        )}
        <Compass size={18} className="text-trail" />
        <h2 class="text-base font-semibold tracking-tight text-stone-700 dark:text-stone-200">
          Summit View
        </h2>
        {onSettingsClick && (
          <button
            type="button"
            onClick={onSettingsClick}
            class="ml-auto text-stone-400 hover:text-stone-600 transition-colors p-0.5"
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
        )}
      </div>
      <div class="bg-white dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
        {error ? (
          <p class="text-sm text-ridge">{error}</p>
        ) : loading || (!text && cacheKey) ? (
          <Skeleton />
        ) : (
          <Markdown
            text={text ?? ""}
            streaming={streaming}
            class="text-sm text-stone-600 dark:text-stone-300"
          />
        )}
      </div>
    </section>
  );
}
