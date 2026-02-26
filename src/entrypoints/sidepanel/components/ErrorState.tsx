import type { ErrorCategory } from "@/utils/messaging";

interface Props {
  category: ErrorCategory;
  message: string;
  onAction: () => void;
  onSettingsClick: () => void;
  onRetry?: () => void;
}

const headings: Record<ErrorCategory, string> = {
  auth: "Permit required",
  access: "Off the map",
  network: "Lost the trail",
  api: "Rough terrain",
  unknown: "Trail blocked",
};

const actionLabels: Record<ErrorCategory, string> = {
  auth: "Sign in with GitHub",
  access: "Manage GitHub App access",
  network: "Try again",
  api: "Try again",
  unknown: "Try again",
};

export function ErrorState({
  category,
  message,
  onAction,
  onSettingsClick,
  onRetry,
}: Props) {
  return (
    <div class="hero-state animate-fade-up">
      <div class="hero-state-bg hero-state-bg--error" />
      <div class="relative flex flex-col items-center text-center px-6 pt-14 pb-8">
        <div class="relative mb-6">
          <div class="absolute inset-0 hidden dark:block rounded-full bg-ridge/15 blur-2xl scale-150" />
          <img
            src="/sherpa-error.png"
            alt="Sherpa looking lost"
            width={140}
            height={140}
            class="relative sherpa-float drop-shadow-lg"
          />
        </div>
        <h2 class="text-lg font-semibold text-stone-800 dark:text-stone-100 tracking-tight mb-2">
          {headings[category]}
        </h2>
        <p class="text-sm text-stone-500 dark:text-stone-400 leading-relaxed max-w-[260px] mb-6">
          {message}
        </p>
        <button type="button" onClick={onAction} class="hero-btn">
          {actionLabels[category]}
        </button>
        {category === "access" ? (
          <button
            type="button"
            class="mt-4 text-[12px] text-stone-400 hover:text-stone-600 transition-colors font-medium"
            onClick={onRetry}
          >
            Try again
          </button>
        ) : (
          <button
            type="button"
            class="mt-4 text-[12px] text-stone-400 hover:text-stone-600 transition-colors font-medium"
            onClick={onSettingsClick}
          >
            Open Settings
          </button>
        )}
      </div>
    </div>
  );
}
