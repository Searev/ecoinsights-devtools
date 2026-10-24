import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const syntaxDir = join(here, "syntax");

const FORBIDDEN = [
  "innerHTML",
  "outerHTML",
  "insertAdjacentHTML",
  "DOMParser",
  "createContextualFragment",
  "document.write",
  "eval(",
  "new Function",
];
const REQUIRED = ["text-view-renderer.ts", "syntax/syntax-types.ts"];

const isSource = (name: string) => /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name);

function scanned(): string[] {
  const own = readdirSync(here)
    .filter((n) => isSource(n) && (n.startsWith("text-") || n.startsWith("Text")))
    .map((n) => join(here, n));
  const syntax = existsSync(syntaxDir)
    ? readdirSync(syntaxDir)
        .filter(isSource)
        .map((n) => join(syntaxDir, n))
    : [];
  return [...own, ...syntax];
}

describe("text viewer safety scan (US-020)", () => {
  const files = scanned();

  it.each(REQUIRED)("required file %s exists and is scanned", (rel) => {
    expect(files).toContain(join(here, rel));
  });

  it("scans at least the required files", () => {
    expect(files.length).toBeGreaterThanOrEqual(REQUIRED.length);
  });

  for (const file of files) {
    it(`${file.slice(here.length + 1)} has no HTML-injection or code-evaluation API`, () => {
      const source = readFileSync(file, "utf8");
      for (const word of FORBIDDEN) {
        expect(source.includes(word), `${word} found`).toBe(false);
      }
    });
  }
});
