import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATED_PATTERNS, isGeneratedFile } from "./generated-files";

describe("isGeneratedFile", () => {
  describe("default patterns", () => {
    const cases: [string, boolean][] = [
      // Lock files
      ["package-lock.json", true],
      ["frontend/package-lock.json", true],
      ["yarn.lock", true],
      ["pnpm-lock.yaml", true],
      ["Cargo.lock", true],
      ["Gemfile.lock", true],
      ["composer.lock", true],
      ["go.sum", true],
      ["vendor/go.sum", true],

      // Minified files
      ["dist/app.min.js", true],
      ["assets/style.min.css", true],

      // Generated files
      ["models/user.generated.ts", true],
      ["lib/widget.g.dart", true],
      ["proto/message.pb.go", true],

      // Normal files — should NOT match
      ["src/index.ts", false],
      ["README.md", false],
      ["package.json", false],
      ["src/utils/lock.ts", false],
      ["src/components/Summary.tsx", false],
      ["go.mod", false],
    ];

    it.each(cases)("%s → %s", (path, expected) => {
      expect(isGeneratedFile(path)).toBe(expected);
    });
  });

  describe("custom patterns", () => {
    it("uses custom patterns when provided", () => {
      const patterns = ["**/custom.gen.ts"];
      expect(isGeneratedFile("src/custom.gen.ts", patterns)).toBe(true);
      expect(isGeneratedFile("package-lock.json", patterns)).toBe(false);
    });
  });

  it("exports a non-empty default pattern list", () => {
    expect(DEFAULT_GENERATED_PATTERNS.length).toBeGreaterThan(0);
  });
});
