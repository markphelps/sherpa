interface FileExplanationInput {
  prSummary: string;
  filePath: string;
  diff: string;
  fullFileContent: string;
  detail: "concise" | "balanced" | "detailed";
}

export function buildFileExplanationPrompt(
  input: FileExplanationInput,
): string {
  const detailInstructions: Record<string, string> = {
    concise: "Explain in 2-4 sentences what changed in this file and why.",
    balanced:
      "Explain what changed and why, using a short bullet list for distinct changes.",
    detailed:
      "Explain what changed, why, and how it connects to the rest of the PR. Use bullet points for distinct changes.",
  };
  const detailInstruction = detailInstructions[input.detail];

  return `You are explaining changes to a single file in a pull request.

## PR Context
${input.prSummary}

## File: ${input.filePath}

### Diff
\`\`\`diff
${input.diff}
\`\`\`

### Full File (after changes)
\`\`\`
${input.fullFileContent}
\`\`\`

## Instructions
${detailInstruction}
Reference specific functions, types, or patterns when relevant.`;
}
