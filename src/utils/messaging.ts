// -- Payload types --

export interface VisibleHunk {
  file: string;
  hunk: number;
}

export interface VisibleHunksPayload {
  visible: VisibleHunk[];
}

export interface PrContextPayload {
  owner: string;
  repo: string;
  prNumber: number;
}

export interface ExplainFilePayload {
  owner: string;
  repo: string;
  prNumber: number;
  filePath: string;
  commitSha: string;
}

export interface ExplainHunkPayload extends ExplainFilePayload {
  hunkIndex: number;
}

export interface ExplanationResultPayload {
  key: string;
  text: string;
  streaming: boolean;
}

export interface PrDataPayload {
  headSha: string;
  files: import("@/providers/types").ChangedFile[];
}

// -- Message type constants --

export const MessageType = {
  VISIBLE_HUNKS: "VISIBLE_HUNKS",
  PR_CONTEXT: "PR_CONTEXT",
  PR_DATA: "PR_DATA",
  EXPLAIN_PR: "EXPLAIN_PR",
  EXPLAIN_FILE: "EXPLAIN_FILE",
  EXPLAIN_HUNK: "EXPLAIN_HUNK",
  EXPLANATION_RESULT: "EXPLANATION_RESULT",
  SIDE_PANEL_READY: "SIDE_PANEL_READY",
  ERROR: "ERROR",
  DETECT_PR: "DETECT_PR",
  PR_CONTEXT_CLEAR: "PR_CONTEXT_CLEAR",
} as const;

// -- Message map --

export type ErrorCategory = "auth" | "access" | "network" | "api" | "unknown";

export interface ErrorPayload {
  category: ErrorCategory;
  message: string;
}

export interface MessageMap {
  VISIBLE_HUNKS: VisibleHunksPayload;
  PR_CONTEXT: PrContextPayload;
  PR_DATA: PrDataPayload;
  EXPLAIN_PR: PrContextPayload;
  EXPLAIN_FILE: ExplainFilePayload;
  EXPLAIN_HUNK: ExplainHunkPayload;
  EXPLANATION_RESULT: ExplanationResultPayload;
  SIDE_PANEL_READY: Record<string, never>;
  ERROR: ErrorPayload;
  DETECT_PR: Record<string, never>;
  PR_CONTEXT_CLEAR: Record<string, never>;
}

export type MessageTypeName = keyof MessageMap;

export interface Message<T extends MessageTypeName = MessageTypeName> {
  type: T;
  payload: MessageMap[T];
}

// -- Helpers --

const validTypes = new Set<string>(Object.values(MessageType));

export function createMessage<T extends MessageTypeName>(
  type: T,
  payload: MessageMap[T],
): Message<T> {
  return { type, payload };
}

export function isMessage(value: unknown): value is Message {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.type === "string" &&
    validTypes.has(obj.type) &&
    typeof obj.payload === "object" &&
    obj.payload !== null
  );
}
