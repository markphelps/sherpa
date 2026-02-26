import type { Hunk } from "@/providers/types";

export function parseHunks(patch: string | undefined): Hunk[] {
  if (!patch) return [];

  const hunks: Hunk[] = [];
  const hunkRegex = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/;
  const lines = patch.split("\n");

  let currentHunk: {
    header: string;
    lines: string[];
    startLine: number;
    lineCount: number;
  } | null = null;
  let hunkIndex = 0;

  for (const line of lines) {
    const match = line.match(hunkRegex);
    if (match) {
      if (currentHunk) {
        hunks.push(makeHunk(currentHunk, hunkIndex++));
      }
      currentHunk = {
        header: line,
        lines: [],
        startLine: parseInt(match[1], 10),
        lineCount: match[2] ? parseInt(match[2], 10) : 1,
      };
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(makeHunk(currentHunk, hunkIndex));
  }

  return hunks;
}

function makeHunk(
  raw: {
    header: string;
    lines: string[];
    startLine: number;
    lineCount: number;
  },
  index: number,
): Hunk {
  return {
    index,
    header: raw.header,
    diff: raw.lines.join("\n"),
    startLine: raw.startLine,
    endLine: Math.max(raw.startLine, raw.startLine + raw.lineCount - 1),
  };
}
