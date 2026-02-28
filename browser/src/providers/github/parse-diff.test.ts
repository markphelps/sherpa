import { describe, expect, it } from "vitest";
import { parseHunks } from "./parse-diff";

const samplePatch = `@@ -1,5 +1,6 @@
 import foo from 'bar';
+import baz from 'qux';
 
 function main() {
   return foo();
@@ -10,3 +11,5 @@
 export default main;
+export const helper = () => {};
+export const util = () => {};`;

describe("parseHunks", () => {
  it("splits a patch into individual hunks", () => {
    const hunks = parseHunks(samplePatch);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].index).toBe(0);
    expect(hunks[0].header).toBe("@@ -1,5 +1,6 @@");
    expect(hunks[0].diff).toContain("import baz from 'qux'");
    expect(hunks[1].index).toBe(1);
    expect(hunks[1].header).toBe("@@ -10,3 +11,5 @@");
  });

  it("returns empty array for undefined patch", () => {
    expect(parseHunks(undefined)).toEqual([]);
    expect(parseHunks("")).toEqual([]);
  });

  it("parses start line from hunk header", () => {
    const hunks = parseHunks(samplePatch);
    expect(hunks[0].startLine).toBe(1);
    expect(hunks[1].startLine).toBe(11);
  });
});
