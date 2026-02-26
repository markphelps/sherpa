import { describe, expect, it } from "vitest";
import { buildFileExplanationPrompt } from "./file-explanation";
import { buildHunkExplanationPrompt } from "./hunk-explanation";
import { buildPrSummaryPrompt } from "./pr-summary";

describe("prompt templates", () => {
  const basePr = {
    title: "feat: add metrics API",
    description: "Adds custom metrics via current_scope()",
    commits: [{ sha: "abc", message: "add metrics module", author: "user" }],
    files: [
      {
        path: "src/metrics.rs",
        additions: 100,
        deletions: 5,
        status: "added" as const,
      },
      {
        path: "src/lib.rs",
        additions: 10,
        deletions: 2,
        status: "modified" as const,
      },
    ],
  };

  it("pr summary prompt includes title and commit messages", () => {
    const prompt = buildPrSummaryPrompt(basePr, "concise");
    expect(prompt).toContain("feat: add metrics API");
    expect(prompt).toContain("add metrics module");
    expect(prompt).toContain("src/metrics.rs");
  });

  it("file explanation prompt includes diff and pr summary context", () => {
    const prompt = buildFileExplanationPrompt({
      prSummary: "This PR adds a metrics API.",
      filePath: "src/metrics.rs",
      diff: "@@ -0,0 +1,10 @@\n+pub struct Metrics {}",
      fullFileContent: "pub struct Metrics {}\nimpl Metrics {}",
      detail: "concise",
    });
    expect(prompt).toContain("src/metrics.rs");
    expect(prompt).toContain("pub struct Metrics");
    expect(prompt).toContain("This PR adds a metrics API.");
  });

  it("hunk explanation prompt includes hunk diff and file context", () => {
    const prompt = buildHunkExplanationPrompt({
      prSummary: "This PR adds a metrics API.",
      fileSummary: "New metrics module with Metrics struct.",
      filePath: "src/metrics.rs",
      hunkHeader: "@@ -0,0 +1,10 @@",
      hunkDiff: "+pub struct Metrics {}",
      detail: "concise",
    });
    expect(prompt).toContain("@@ -0,0 +1,10 @@");
    expect(prompt).toContain("New metrics module");
  });

  it("pr summary prompt uses balanced instruction for balanced detail", () => {
    const prompt = buildPrSummaryPrompt(basePr, "balanced");
    expect(prompt).toContain("purpose");
    expect(prompt).not.toContain("2-4 sentences");
    expect(prompt).not.toContain("thorough");
  });

  it("file explanation prompt uses balanced instruction", () => {
    const prompt = buildFileExplanationPrompt({
      prSummary: "This PR adds a metrics API.",
      filePath: "src/metrics.rs",
      diff: "@@ -0,0 +1,10 @@\n+pub struct Metrics {}",
      fullFileContent: "pub struct Metrics {}\nimpl Metrics {}",
      detail: "balanced",
    });
    expect(prompt).toContain("src/metrics.rs");
    expect(prompt).not.toContain("2-4 sentences");
  });

  it("hunk explanation prompt uses balanced instruction", () => {
    const prompt = buildHunkExplanationPrompt({
      prSummary: "This PR adds a metrics API.",
      fileSummary: "New metrics module.",
      filePath: "src/metrics.rs",
      hunkHeader: "@@ -0,0 +1,10 @@",
      hunkDiff: "+pub struct Metrics {}",
      detail: "balanced",
    });
    expect(prompt).not.toContain("1-2 sentences");
  });
});
