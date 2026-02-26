/**
 * Patterns and detection for generated/lock files that should not auto-expand
 * during scroll sync.
 */

export const DEFAULT_GENERATED_PATTERNS: string[] = [
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/*.lock",
  "**/go.sum",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.generated.*",
  "**/*.g.dart",
  "**/*.pb.go",
];

/** Check whether a file path matches any of the generated-file glob patterns. */
export function isGeneratedFile(
  path: string,
  patterns: string[] = DEFAULT_GENERATED_PATTERNS,
): boolean {
  const filename = path.split("/").pop() ?? path;

  return patterns.some((pattern) => {
    // Strip leading **/ if present
    const stripped = pattern.replace(/^\*\*\//, "");

    if (!stripped.includes("*")) {
      // Exact filename match: **/package-lock.json
      return filename === stripped;
    }

    // Wildcard suffix match: **/*.lock, **/*.min.js, **/*.generated.*, **/*.g.dart
    // Convert the remaining pattern to a suffix check
    const suffix = stripped.replace(/^\*/, "");
    if (suffix.includes("*")) {
      // Pattern like **/*.generated.* — match the middle part
      // e.g. *.generated.* should match foo.generated.ts
      const parts = stripped.split("*").filter(Boolean);
      // parts = [".generated."] for *.generated.*
      return parts.every((part) => filename.includes(part));
    }

    return filename.endsWith(suffix);
  });
}
