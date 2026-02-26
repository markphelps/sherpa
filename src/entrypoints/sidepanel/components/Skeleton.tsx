export function Skeleton() {
  return (
    <output class="block space-y-2 py-2" aria-label="Loading">
      <div class="skeleton-shimmer h-3 w-4/5" />
      <div class="skeleton-shimmer h-3 w-full" />
      <div class="skeleton-shimmer h-3 w-3/5" />
    </output>
  );
}
