import { describe, expect, it } from "vitest";
import { createMessage, isMessage, MessageType } from "./messaging";

describe("messaging", () => {
  it("creates a valid VISIBLE_HUNKS message", () => {
    const msg = createMessage(MessageType.VISIBLE_HUNKS, {
      visible: [{ file: "src/main.ts", hunk: 0 }],
    });
    expect(msg.type).toBe("VISIBLE_HUNKS");
    expect(msg.payload.visible).toHaveLength(1);
  });

  it("validates message shape with isMessage", () => {
    expect(isMessage({ type: "VISIBLE_HUNKS", payload: { visible: [] } })).toBe(
      true,
    );
    expect(
      isMessage({
        type: "ERROR",
        payload: { category: "auth", message: "test" },
      }),
    ).toBe(true);
    expect(isMessage({ type: "UNKNOWN_TYPE" })).toBe(false);
    expect(isMessage({ type: "AUTH_REQUIRED" })).toBe(false);
    expect(isMessage(null)).toBe(false);
    expect(isMessage("string")).toBe(false);
    expect(isMessage({ type: "VISIBLE_HUNKS", payload: null })).toBe(false);
    expect(isMessage({ type: "VISIBLE_HUNKS", payload: "string" })).toBe(false);
    expect(isMessage({ type: "VISIBLE_HUNKS", payload: 42 })).toBe(false);
  });

  it("creates EXPLAIN_FILE request", () => {
    const msg = createMessage(MessageType.EXPLAIN_FILE, {
      owner: "replicate",
      repo: "cog",
      prNumber: 2752,
      filePath: "src/main.ts",
      commitSha: "abc123",
    });
    expect(msg.type).toBe("EXPLAIN_FILE");
    expect(msg.payload.prNumber).toBe(2752);
  });
});
