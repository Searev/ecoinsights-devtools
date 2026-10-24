import { describe, expect, it } from "vitest";
import { createLineHighlighter } from "./index";
import {
  HOSTILE_LINES, LANGUAGES, assertInvariant, coloured, randomLine, seededRandom,
} from "./test-kit";

describe("createLineHighlighter", () => {
  it.each([
    ["javascript", "const a = 1;", ["keyword:const", "number:1"]],
    ["json", '{"a": true}', ['key:"a"', "literal:true"]],
    ["css", "a { top: 1px }", ["selector:a", "property:top", "number:1px"]],
    ["markup", '<a href="x">', ["tag:<a", "attr-name:href", 'attr-value:"x"', "tag:>"]],
  ] as const)("maps %s to its tokenizer", (language, text, expected) => {
    expect(coloured(createLineHighlighter(language).line(text))).toEqual(expected);
  });

  it.each(LANGUAGES)("returns an independent highlighter per call (%s)", (language) => {
    const opening: Record<string, string> = {
      javascript: "/* open",
      json: '"open',
      css: "/* open",
      markup: "<!-- open",
    };
    const a = createLineHighlighter(language);
    const b = createLineHighlighter(language);
    expect(a).not.toBe(b);
    a.line(opening[language]);
    const fresh = createLineHighlighter(language).line("1");
    expect(b.line("1")).toEqual(fresh);
  });

  it.each(LANGUAGES)("keeps the invariant on hostile lines and fuzz (%s)", (language) => {
    const h = createLineHighlighter(language);
    for (const l of HOSTILE_LINES) assertInvariant(l, h.line(l));
    const random = seededRandom(24);
    for (let i = 0; i < 2000; i++) {
      const l = randomLine(random);
      assertInvariant(l, h.line(l));
    }
  });

  it("returns a plain highlighter for an unexpected language, never throwing", () => {
    const h = createLineHighlighter("cobol" as never);
    expect(h.line("abc")).toEqual([{ text: "abc" }]);
    expect(h.line("")).toEqual([]);
  });
});
