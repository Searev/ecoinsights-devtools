import { describe, expect, it } from "vitest";
import { createJavaScriptHighlighter } from "./javascript";
import {
  HOSTILE_LINES, assertInvariant, coloured, highlightLines, randomLine, repeatToLength,
  runChecked, seededRandom,
} from "./test-kit";

const line = (text: string) => coloured(createJavaScriptHighlighter().line(text));

describe("JavaScript tokens", () => {
  it("colours comments", () => {
    expect(line("a(); // note")).toEqual(["comment:// note"]);
    expect(line("a /* x */ b")).toEqual(["comment:/* x */"]);
  });

  it("colours strings with escapes, and ends an unterminated one at the line end", () => {
    expect(line(`x = "a\\"b" + 'c'`)).toEqual(['string:"a\\"b"', "string:'c'"]);
    expect(line(`x = "abc`)).toEqual(['string:"abc']);
    expect(line(`x = 'it\\'s`)).toEqual(["string:'it\\'s"]);
  });

  it("colours numbers in every notation", () => {
    for (const n of ["42", ".5", "3.14", "1e10", "2E-3", "0xFF", "0o17", "0b101", "1_000", "10n"]) {
      expect(line(`x = ${n};`)).toEqual([`number:${n}`]);
    }
  });

  it("colours keywords and literals", () => {
    expect(line("const x = true;")).toEqual(["keyword:const", "literal:true"]);
    expect(line("if (a === null) return undefined;")).toEqual([
      "keyword:if", "literal:null", "keyword:return", "literal:undefined",
    ]);
    expect(line("return NaN + Infinity")).toEqual(["keyword:return", "literal:NaN", "literal:Infinity"]);
    expect(line("async function f() { await x; }")).toEqual([
      "keyword:async", "keyword:function", "keyword:await",
    ]);
  });

  it("keeps identifiers that contain a keyword plain", () => {
    expect(line("el.classList.add(newValue, forEach, class_, $if)")).toEqual([]);
  });

  it("does not colour a keyword used as a property name", () => {
    expect(line("a.default.class = 1")).toEqual(["number:1"]);
  });

  it("treats a slash after a value as division", () => {
    expect(line("x = a / b / c")).toEqual([]);
    expect(line("x = (a) / 2 / 3")).toEqual(["number:2", "number:3"]);
    expect(line("x = arr[0] / 2")).toEqual(["number:0", "number:2"]);
  });

  it("treats a slash after an operator or keyword as a regular expression", () => {
    expect(line("return /x[/]y/g")).toEqual(["keyword:return", "string:/x[/]y/g"]);
    expect(line("a = /ab+c/i.test(s)")).toEqual(["string:/ab+c/i"]);
    expect(line("/^a$/.test(s)")).toEqual(["string:/^a$/"]);
  });

  it("falls back to an operator when a regex is not closed", () => {
    expect(line("a = / b")).toEqual([]);
  });

  it("has no state at line start", () => {
    const h = createJavaScriptHighlighter();
    expect(coloured(h.line("a = 1"))).toEqual(["number:1"]);
  });
});

describe("JavaScript state across lines", () => {
  it("continues a multi-line block comment", () => {
    const h = createJavaScriptHighlighter();
    const out = highlightLines(h, ["a /* start", " middle", "end */ b = 2"]).map(coloured);
    expect(out).toEqual([["comment:/* start"], ["comment: middle"], ["comment:end */", "number:2"]]);
  });

  it("continues a template literal and approximates ${ }", () => {
    const h = createJavaScriptHighlighter();
    const out = highlightLines(h, ["x = `line one", "two ${a + 1} three", "end` + 5"]).map(coloured);
    expect(out[0]).toEqual(["string:`line one"]);
    expect(out[1]).toContain("string:two ");
    expect(out[1]).toContain("string: three");
    expect(out[2]).toEqual(["string:end`", "number:5"]);
  });

  it("handles nested braces and templates inside ${ }", () => {
    const h = createJavaScriptHighlighter();
    const [tokens] = highlightLines(h, ["`a ${ {x: 1}.x + `b${c}` } z` + 7"]);
    expect(coloured(tokens)).toContain("number:7");
    expect(coloured(tokens)).toContain("string: z`");
  });

  it("recovers after an unterminated string on the previous line", () => {
    const h = createJavaScriptHighlighter();
    const out = highlightLines(h, ['a = "oops', "b = 2"]).map(coloured);
    expect(out[1]).toEqual(["number:2"]);
  });

  it("remembers the previous significant token across lines", () => {
    const h = createJavaScriptHighlighter();
    const out = highlightLines(h, ["const r =", "  /a+/g;"]).map(coloured);
    expect(out[1]).toEqual(["string:/a+/g"]);
  });
});

describe("JavaScript robustness", () => {
  it("keeps the invariant on a realistic file", () => {
    const code = [
      "'use strict';",
      "/** Doc */",
      "export class A extends B {",
      "  static #p = 0x1f;",
      "  async get(id = 1.5e3) { return `${id}-${this.#p}` || /re/u; }",
      "}",
    ];
    expect(runChecked(createJavaScriptHighlighter(), code)).toBeGreaterThan(0);
  });

  it("survives hostile lines", () => {
    const h = createJavaScriptHighlighter();
    for (const l of HOSTILE_LINES) assertInvariant(l, h.line(l));
  });

  it("survives 2000 random lines (seeded fuzz)", () => {
    const random = seededRandom(20);
    const h = createJavaScriptHighlighter();
    for (let i = 0; i < 2000; i++) {
      const l = randomLine(random);
      assertInvariant(l, h.line(l));
    }
  });
});

describe("JavaScript performance", () => {
  const snippet = [
    "// compute totals",
    "function total(items) {",
    "  /* sum the prices */",
    "  let sum = 0;",
    "  for (const item of items) { sum += item.price * 1.2 / 3; }",
    "  const label = `Total: ${sum.toFixed(2)} (${items.length} items)`;",
    "  return label.replace(/\\s+/g, ' ') + \"done\";",
    "}",
    "",
  ].join("\n");

  it("highlights 500 000 characters in under 250 ms", () => {
    const lines = repeatToLength(snippet, 500_000).split("\n");
    const h = createJavaScriptHighlighter();
    const start = performance.now();
    for (const l of lines) h.line(l);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("highlights one 80 000-character line in under 50 ms", () => {
    const l = repeatToLength("a = b / 2 + 'x' + /y/g; ", 80_000);
    const h = createJavaScriptHighlighter();
    const start = performance.now();
    const tokens = h.line(l);
    expect(performance.now() - start).toBeLessThan(50);
    assertInvariant(l, tokens);
  });

  it("stays linear on pathological lines", () => {
    for (const l of ["= /x".repeat(20_000), "/[".repeat(40_000), "${".repeat(40_000), '"\\'.repeat(40_000)]) {
      const h = createJavaScriptHighlighter();
      const start = performance.now();
      assertInvariant(l, h.line(l));
      expect(performance.now() - start).toBeLessThan(100);
    }
  });
});
