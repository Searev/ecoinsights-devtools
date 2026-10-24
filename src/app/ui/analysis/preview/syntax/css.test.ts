import { describe, expect, it } from "vitest";
import { createCssHighlighter } from "./css";
import {
  HOSTILE_LINES, assertInvariant, coloured, highlightLines, randomLine, repeatToLength, runChecked,
  seededRandom,
} from "./test-kit";

const lines = (src: string[]) => highlightLines(createCssHighlighter(), src).map(coloured);

describe("CSS tokens", () => {
  it("colours a rule on one line", () => {
    expect(lines([".a > b:hover { color: red; margin: 0 auto }"])[0]).toEqual([
      "selector:.a > b:hover", "property:color", "value:red", "property:margin", "number:0",
      "value:auto",
    ]);
  });

  it("colours comments, including inside values and selectors", () => {
    expect(lines(["/* hi */ a { /* x */ color: red /* y */; }"])[0]).toEqual([
      "comment:/* hi */", "selector:a", "comment:/* x */", "property:color", "value:red",
      "comment:/* y */",
    ]);
  });

  it("colours at-rules as keywords", () => {
    expect(lines(['@import url("a.css");'])[0]).toEqual(["keyword:@import", 'string:"a.css"']);
    expect(lines(["@media (min-width: 600px) {"])[0]).toEqual(["keyword:@media"]);
    expect(lines(["@font-face {"])[0]).toEqual(["keyword:@font-face"]);
  });

  it("colours custom properties and !important", () => {
    expect(lines([":root { --main-color: #fff !important; }"])[0]).toEqual([
      "selector::root", "property:--main-color", "number:#fff", "keyword:!important",
    ]);
  });

  it("colours numbers with units, percentages and hex colours", () => {
    expect(lines(["a { width: calc(100% - 2.5rem); top: -1px; z-index: 10; color: #A0b1C2 }"])[0]).toEqual([
      "selector:a", "property:width", "value:calc(", "number:100%", "value:-", "number:2.5rem",
      "value:)", "property:top", "number:-1px", "property:z-index", "number:10", "property:color",
      "number:#A0b1C2",
    ]);
  });

  it("keeps digits inside identifiers in the value", () => {
    expect(lines(["a { font-family: Helvetica2, h1; transform: translate3d(0, 0, 0) }"])[0]).toEqual([
      "selector:a", "property:font-family", "value:Helvetica2, h1", "property:transform",
      "value:translate3d(", "number:0", "value:,", "number:0", "value:,", "number:0", "value:)",
    ]);
  });

  it("colours strings in values and attribute selectors", () => {
    expect(lines(['a[href="x"] { content: "\\201C" }'])[0]).toEqual([
      "selector:a[href=", 'string:"x"', "selector:]", "property:content", 'string:"\\201C"',
    ]);
  });

  it("does not split a url() on its semicolon", () => {
    const out = lines(["a { background: url(data:image/png;base64,AAAA) no-repeat; color: red }"])[0];
    expect(out).toContain("property:color");
    expect(out.filter((t) => t.startsWith("property:"))).toEqual(["property:background", "property:color"]);
  });
});

describe("CSS state across lines", () => {
  it("continues a multi-line comment", () => {
    expect(lines(["/* a", "b", "c */ d { }"])).toEqual([
      ["comment:/* a"], ["comment:b"], ["comment:c */", "selector:d"],
    ]);
  });

  it("tracks a block over lines", () => {
    expect(lines(["body", "{", "  color: red;", "  margin: 1em", "}", "p { top: 0 }"])).toEqual([
      ["selector:body"], [], ["property:color", "value:red"], ["property:margin", "number:1em"], [],
      ["selector:p", "property:top", "number:0"],
    ]);
  });

  it("continues a value on the next line", () => {
    expect(lines(["a { font-family: A,", "  B; color: red }"])[1]).toEqual(["value:B", "property:color", "value:red"]);
  });

  it("tracks nested at-rule blocks", () => {
    expect(
      lines(["@media (max-width: 1px) {", "  .a, .b {", "    color: red;", "  }", "}", ".c { top: 1px }"]),
    ).toEqual([
      ["keyword:@media"], ["selector:.a, .b"], ["property:color", "value:red"], [], [],
      ["selector:.c", "property:top", "number:1px"],
    ]);
  });

  it("treats keyframe steps as selectors", () => {
    expect(lines(["@keyframes x {", "  from { top: 0 }", "  50% { top: 5px }", "}"])).toEqual([
      ["keyword:@keyframes"], ["selector:from", "property:top", "number:0"],
      ["selector:50%", "property:top", "number:5px"], [],
    ]);
  });

  it("treats @font-face content as declarations", () => {
    expect(lines(["@font-face {", "  font-family: X;", "}"])[1]).toEqual(["property:font-family", "value:X"]);
  });

  it("colours a nested rule's selector inside a block", () => {
    expect(lines(["a {", "  &:hover { color: red }", "}"])[1]).toEqual([
      "selector:&:hover", "property:color", "value:red",
    ]);
  });

  it("ignores a stray closing brace", () => {
    expect(lines(["} a { top: 1px }"])[0]).toEqual(["selector:a", "property:top", "number:1px"]);
  });
});

describe("CSS robustness", () => {
  it("keeps the invariant on a stylesheet", () => {
    const css = ["@charset \"utf-8\";", "/* c */", "a:not(.b)::before { content: '\\'' ; }", "@supports (x: y) { a { b: c } }"];
    expect(runChecked(createCssHighlighter(), css)).toBeGreaterThan(0);
  });

  it("survives hostile lines (10 000 nested braces included)", () => {
    const h = createCssHighlighter();
    for (const l of HOSTILE_LINES) assertInvariant(l, h.line(l));
    assertInvariant("{".repeat(10_000), createCssHighlighter().line("{".repeat(10_000)));
  });

  it("survives 2000 random lines (seeded fuzz)", () => {
    const random = seededRandom(22);
    const h = createCssHighlighter();
    for (let i = 0; i < 2000; i++) {
      const l = randomLine(random);
      assertInvariant(l, h.line(l));
    }
  });
});

describe("CSS performance", () => {
  const snippet = [
    "/* card */",
    ".card > .title:hover, #main a[href^='http'] {",
    "  margin: 0 auto;",
    "  font: 12px/1.5 'Helvetica Neue', Arial, sans-serif;",
    "  background: url(data:image/png;base64,iVBORw0KGgo) #fff !important;",
    "}",
    "@media (max-width: 600px) { .card { padding: 1.5rem 10% } }",
    "",
  ].join("\n");

  it("highlights 500 000 characters in under 250 ms", () => {
    const rows = repeatToLength(snippet, 500_000).split("\n");
    const h = createCssHighlighter();
    const start = performance.now();
    for (const l of rows) h.line(l);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("highlights one 80 000-character line in under 50 ms", () => {
    const l = repeatToLength("a { margin: 0 auto; color: #fff } ", 80_000);
    const start = performance.now();
    assertInvariant(l, createCssHighlighter().line(l));
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("stays linear on pathological lines", () => {
    for (const l of ["a:".repeat(40_000), "a{b:".repeat(20_000), "/*".repeat(40_000), "url(".repeat(20_000)]) {
      const start = performance.now();
      assertInvariant(l, createCssHighlighter().line(l));
      expect(performance.now() - start).toBeLessThan(100);
    }
  });
});
