// -- Domain types (provider-agnostic) --

export interface Commit {
  sha: string;
  message: string;
  author: string;
}

export interface Hunk {
  index: number;
  header: string; // @@ line
  diff: string; // the actual hunk content
  startLine: number;
  endLine: number;
}

export interface ChangedFile {
  path: string;
  diff: string;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  status: "added" | "removed" | "modified" | "renamed";
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  headSha: string;
  commits: Commit[];
  files: ChangedFile[];
}

// -- Provider interface --

export interface CodeReviewProvider {
  name: string;
  matchesUrl(url: string): boolean;
  authenticate(): Promise<void>;
  isAuthenticated(): boolean;
  getPullRequest(url: string): Promise<PullRequest>;
  getFileContent(pr: PullRequest, path: string, ref: string): Promise<string>;
}

// -- DOM adapter interface --

export interface FileElement {
  path: string;
  element: Element;
}

export interface HunkElement {
  index: number;
  header: string;
  element: Element;
}

export interface DOMAdapter {
  getFileElements(): FileElement[];
  getHunkElements(file: FileElement): HunkElement[];
  observeNewFiles(callback: (file: FileElement) => void): () => void; // returns cleanup fn
  parseUrlContext(
    url: string,
  ): { owner: string; repo: string; prId: string } | null;
}
