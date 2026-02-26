type FileInfo = {
  path: string;
  additions: number;
  deletions: number;
  status: string;
};
type PrInfo = {
  title: string;
  description: string;
  commits: { message: string }[];
  files: FileInfo[];
};

export function buildPrSummaryPrompt(
  pr: PrInfo,
  detail: "concise" | "balanced" | "detailed",
): string {
  const fileList = pr.files
    .map(
      (f) =>
        `  ${f.status === "added" ? "+" : f.status === "removed" ? "-" : "~"} ${f.path} (+${f.additions}/-${f.deletions})`,
    )
    .join("\n");

  const commitList = pr.commits.map((c) => `  - ${c.message}`).join("\n");

  const detailInstructions: Record<string, string> = {
    concise:
      "Write 2-4 sentences summarizing the overall purpose and approach.",
    balanced:
      "Summarize the purpose and approach. Call out notable design decisions in a short bullet list.",
    detailed:
      "Write a thorough summary covering purpose, approach, and notable design decisions. Use bullet points.",
  };
  const detailInstruction = detailInstructions[detail];

  return `You are explaining a pull request to a developer who is about to review it.

## Pull Request
**Title:** ${pr.title}
**Description:**
${pr.description || "(no description)"}

## Commits
${commitList}

## Changed Files
${fileList}

## Instructions
${detailInstruction}
Focus on the "why" — what problem does this solve and what approach was taken.
Do not list individual files. Do not repeat the title.`;
}
