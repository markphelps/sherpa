interface HunkExplanationInput {
  prSummary: string;
  fileSummary: string;
  filePath: string;
  hunkHeader: string;
  hunkDiff: string;
  detail: "concise" | "balanced" | "detailed";
}

export function buildHunkExplanationPrompt(
  input: HunkExplanationInput,
): string {
  const detailInstructions: Record<string, string> = {
    concise: "Explain in 1-2 sentences what this specific change does.",
    balanced: "Explain what this change does and why it is needed.",
    detailed:
      "Explain what this change does, why it is needed, and any implications.",
  };
  const detailInstruction = detailInstructions[input.detail];

  return `You are explaining a specific code change (hunk) within a file.

## PR Context
${input.prSummary}

## File: ${input.filePath}
${input.fileSummary}

## Hunk
${input.hunkHeader}
\`\`\`diff
${input.hunkDiff}
\`\`\`

## Instructions
${detailInstruction}`;
}
