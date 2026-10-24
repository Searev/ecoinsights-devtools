import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "test-kit.ts");
const read = (f: string) => readFileSync(join(dir, f), "utf8");

describe("syntax sources", () => {
  it("includes the tokenizers and the palette", () => {
    for (const f of ["javascript.ts", "json.ts", "css.ts", "markup.ts", "index.ts", "syntax-palette.ts"]) {
      expect(sources).toContain(f);
    }
  });

  it("uses no HTML-parsing or code-evaluating API", () => {
    const banned = ["innerHTML", "outerHTML", "insertAdjacentHTML", "DOMParser", "createContextualFragment", "document.write", "eval(", "new Function"];
    for (const f of sources) for (const word of banned) expect(read(f), `${f} / ${word}`).not.toContain(word);
  });

  it("keeps the palette free of the tokenizers and index.ts unimported by production code", () => {
    expect(read("syntax-palette.ts")).not.toMatch(/from "\.\/(javascript|json|css|markup|index)"/);
    for (const f of sources.filter((s) => s !== "index.ts")) {
      expect(read(f), f).not.toMatch(/from "\.\/index"/);
    }
  });
});
