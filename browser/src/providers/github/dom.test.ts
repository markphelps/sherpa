// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { GitHubDOMAdapter } from "./dom";
import { getSelectors, validateSelectors } from "./selectors";

afterEach(() => {
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Helper: build a minimal beta diff DOM
// ---------------------------------------------------------------------------
function buildBetaDOM(files: { path: string; hunks?: string[] }[]): void {
  const container = document.createElement("div");
  container.setAttribute("data-testid", "progressive-diffs-list");

  for (const f of files) {
    const file = document.createElement("div");
    file.id = `diff-${f.path.replace(/[/.]/g, "")}`;
    file.className = "Diff-module__diff--abc";

    const btn = document.createElement("button");
    btn.setAttribute("data-file-path", f.path);
    file.appendChild(btn);

    const table = document.createElement("table");
    table.setAttribute("data-diff-anchor", file.id);
    for (const h of f.hunks ?? []) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.className = "diff-hunk-cell";
      td.textContent = h;
      tr.appendChild(td);
      table.appendChild(tr);
    }
    file.appendChild(table);
    container.appendChild(file);
  }
  document.body.appendChild(container);
}

// ---------------------------------------------------------------------------
// Helper: build a minimal legacy diff DOM
// ---------------------------------------------------------------------------
function buildLegacyDOM(files: { path: string; hunks?: string[] }[]): void {
  const container = document.createElement("div");
  container.id = "files";
  container.className = "diff-view commentable js-diff-container";

  for (const f of files) {
    const file = document.createElement("div");
    file.className = "file js-file";
    file.id = `diff-${f.path.replace(/[/.]/g, "")}`;

    const header = document.createElement("div");
    header.className = "file-header";
    header.setAttribute("data-path", f.path);
    file.appendChild(header);

    const table = document.createElement("table");
    table.className = "diff-table";
    table.setAttribute("data-diff-anchor", file.id);
    for (const h of f.hunks ?? []) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.className = "blob-code blob-code-inner blob-code-hunk";
      td.textContent = h;
      tr.appendChild(td);
      table.appendChild(tr);
    }
    file.appendChild(table);
    container.appendChild(file);
  }
  document.body.appendChild(container);
}

// ===========================================================================
// getSelectors() detection
// ===========================================================================
describe("getSelectors", () => {
  it("returns beta selectors when progressive-diffs-list exists", () => {
    buildBetaDOM([{ path: "a.ts" }]);
    const s = getSelectors();
    expect(s.diffContainer).toBe('[data-testid="progressive-diffs-list"]');
    expect(s.hunkHeader).toBe("td.diff-hunk-cell");
  });

  it("returns legacy selectors when progressive-diffs-list is absent", () => {
    buildLegacyDOM([{ path: "a.ts" }]);
    const s = getSelectors();
    expect(s.diffContainer).toBe("#files");
    expect(s.hunkHeader).toBe("td.blob-code-hunk");
  });

  it("defaults to legacy selectors on an empty page", () => {
    const s = getSelectors();
    expect(s.diffContainer).toBe("#files");
  });
});

// ===========================================================================
// validateSelectors
// ===========================================================================
describe("validateSelectors", () => {
  it("reports no missing selectors for a complete beta DOM", () => {
    buildBetaDOM([{ path: "a.ts" }]);
    expect(validateSelectors()).toEqual([]);
  });

  it("reports no missing selectors for a complete legacy DOM", () => {
    buildLegacyDOM([{ path: "a.ts" }]);
    expect(validateSelectors()).toEqual([]);
  });

  it("reports missing selectors on empty page", () => {
    const missing = validateSelectors();
    expect(missing).toContain("diffContainer");
    expect(missing).toContain("fileContainer (none found)");
  });
});

// ===========================================================================
// GitHubDOMAdapter — beta UI
// ===========================================================================
describe("GitHubDOMAdapter (beta)", () => {
  const adapter = new GitHubDOMAdapter();

  it("getFileElements returns files with correct paths", () => {
    buildBetaDOM([{ path: "src/foo.ts" }, { path: "src/bar.ts" }]);
    const files = adapter.getFileElements();
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/foo.ts");
    expect(files[1].path).toBe("src/bar.ts");
  });

  it("getHunkElements returns hunks", () => {
    buildBetaDOM([
      { path: "a.ts", hunks: ["@@ -1,3 +1,5 @@", "@@ -10,2 +12,4 @@"] },
    ]);
    const files = adapter.getFileElements();
    const hunks = adapter.getHunkElements(files[0]);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].header).toBe("@@ -1,3 +1,5 @@");
    expect(hunks[1].index).toBe(1);
  });

  it("getFilePath returns 'unknown' when path element is missing", () => {
    const container = document.createElement("div");
    container.setAttribute("data-testid", "progressive-diffs-list");
    const file = document.createElement("div");
    file.id = "diff-x";
    file.className = "Diff-module__diff--abc";
    container.appendChild(file);
    document.body.appendChild(container);

    const files = adapter.getFileElements();
    expect(files[0].path).toBe("unknown");
  });
});

// ===========================================================================
// GitHubDOMAdapter — legacy UI
// ===========================================================================
describe("GitHubDOMAdapter (legacy)", () => {
  const adapter = new GitHubDOMAdapter();

  it("getFileElements returns files with correct paths", () => {
    buildLegacyDOM([{ path: "src/foo.ts" }, { path: "src/bar.ts" }]);
    const files = adapter.getFileElements();
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/foo.ts");
    expect(files[1].path).toBe("src/bar.ts");
  });

  it("getHunkElements returns hunks", () => {
    buildLegacyDOM([
      { path: "a.ts", hunks: ["@@ -1,3 +1,5 @@", "@@ -10,2 +12,4 @@"] },
    ]);
    const files = adapter.getFileElements();
    const hunks = adapter.getHunkElements(files[0]);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].header).toBe("@@ -1,3 +1,5 @@");
    expect(hunks[1].index).toBe(1);
  });

  it("getFilePath returns 'unknown' when file-header is missing", () => {
    const container = document.createElement("div");
    container.id = "files";
    const file = document.createElement("div");
    file.className = "file";
    container.appendChild(file);
    document.body.appendChild(container);

    const files = adapter.getFileElements();
    expect(files[0].path).toBe("unknown");
  });
});

// ===========================================================================
// parseUrlContext (UI-independent)
// ===========================================================================
describe("parseUrlContext", () => {
  const adapter = new GitHubDOMAdapter();

  it("parses a valid PR URL", () => {
    expect(
      adapter.parseUrlContext("https://github.com/owner/repo/pull/42/files"),
    ).toEqual({ owner: "owner", repo: "repo", prId: "42" });
  });

  it("returns null for non-PR URLs", () => {
    expect(adapter.parseUrlContext("https://github.com/owner/repo")).toBeNull();
  });
});
