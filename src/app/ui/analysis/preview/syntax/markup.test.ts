import { describe, expect, it } from "vitest";
import { createMarkupHighlighter } from "./markup";
import {
  HOSTILE_LINES, assertInvariant, coloured, highlightLines, randomLine, repeatToLength, runChecked,
  seededRandom,
} from "./test-kit";

const lines = (src: string[]) => highlightLines(createMarkupHighlighter(), src).map(coloured);

describe("Markup tokens", () => {
  it("colours tags, attribute names and values", () => {
    expect(lines(['<a href="x" data-y=\'z\' hidden class=big>text</a>'])[0]).toEqual([
      "tag:<a", "attr-name:href", 'attr-value:"x"', "attr-name:data-y", "attr-value:'z'",
      "attr-name:hidden", "attr-name:class", "attr-value:big", "tag:>", "tag:</a>",
    ]);
  });

  it("colours self-closing tags and plain text", () => {
    expect(lines(["<br/> a < b &amp; c <img src=a />"])[0]).toEqual([
      "tag:<br/>", "tag:<img", "attr-name:src", "attr-value:a", "tag:/>",
    ]);
  });

  it("leaves the equals sign and the text plain", () => {
    const tokens = createMarkupHighlighter().line('<p id="a">hello</p>');
    expect(tokens.find((t) => t.text === "hello")?.kind).toBeUndefined();
    expect(tokens.find((t) => t.text === "=")?.kind).toBeUndefined();
  });

  it("colours comments, doctype, XML declaration and CDATA", () => {
    expect(lines(["<!-- a --><!DOCTYPE html>"])[0]).toEqual(["comment:<!-- a -->", "keyword:<!DOCTYPE html>"]);
    expect(lines(['<?xml version="1.0"?>'])[0]).toEqual(['keyword:<?xml version="1.0"?>']);
    expect(lines(["<![CDATA[ x < y ]]>"])[0]).toEqual(["string:<![CDATA[ x < y ]]>"]);
  });

  it("handles namespaces and svg attributes", () => {
    expect(lines(['<svg xmlns:xlink="u" viewBox="0 0 1 1"><path d="M0 0"/></svg>'])[0]).toEqual([
      "tag:<svg", "attr-name:xmlns:xlink", 'attr-value:"u"', "attr-name:viewBox",
      'attr-value:"0 0 1 1"', "tag:><path", "attr-name:d", 'attr-value:"M0 0"', "tag:/></svg>",
    ]);
  });
});

describe("Markup state across lines", () => {
  it("continues a multi-line comment", () => {
    expect(lines(["a <!-- x", "y", "z --> <b>"])).toEqual([
      ["comment:<!-- x"], ["comment:y"], ["comment:z -->", "tag:<b>"],
    ]);
  });

  it("continues a tag over several lines", () => {
    expect(lines(["<div", '  class="a', '  b"', "  id=x", ">", "text"])).toEqual([
      ["tag:<div"], ["attr-name:class", 'attr-value:"a'], ['attr-value:  b"'], ["attr-name:id", "attr-value:x"], ["tag:>"], [],
    ]);
  });

  it("delegates a script block to the JavaScript highlighter", () => {
    expect(lines(["<script>", "  const a = 'x'; // c", "</script>", "<p>"])).toEqual([
      ["tag:<script>"],
      ["keyword:const", "string:'x'", "comment:// c"],
      ["tag:</script>"],
      ["tag:<p>"],
    ]);
  });

  it("carries the JavaScript state across the lines of a script", () => {
    const out = lines(['<script type="text/javascript">/* a', "b */ var x = 1;</script><p>"]);
    expect(out[0]).toEqual(["tag:<script", "attr-name:type", 'attr-value:"text/javascript"', "tag:>", "comment:/* a"]);
    expect(out[1]).toEqual(["comment:b */", "keyword:var", "number:1", "tag:</script><p>"]);
  });

  it("delegates JSON scripts to the JSON highlighter", () => {
    const out = lines(['<script type="application/ld+json">{"a": 1}</script>']);
    expect(out[0]).toContain('key:"a"');
    expect(out[0]).toContain("number:1");
  });

  it("delegates a style block to the CSS highlighter", () => {
    expect(lines(["<style>", "a { color: red }", "</style>"])).toEqual([
      ["tag:<style>"], ["selector:a", "property:color", "value:red"], ["tag:</style>"],
    ]);
  });

  it("leaves non-script types plain", () => {
    expect(lines(['<script type="text/x-template">', "const a = 1;", "</script>"])[1]).toEqual([]);
  });

  it("ends the script at a case-insensitive closing tag", () => {
    expect(lines(["<SCRIPT>var a</Script ><b>"])[0]).toEqual([
      "tag:<SCRIPT>", "keyword:var", "tag:</Script", "tag:><b>",
    ]);
  });

  it("does not delegate a self-closing script", () => {
    expect(lines(["<script src=a.js />", "var x = 1;"])[1]).toEqual([]);
  });

  it("starts each element with a fresh sub-highlighter", () => {
    const out = lines(["<script>/* open", "</script>", "<script>var a = 1;", "</script>"]);
    expect(out[2]).toEqual(["tag:<script>", "keyword:var", "number:1"]);
  });
});

describe("Markup hostile content stays text", () => {
  it("tokenises hostile lines without losing a character", () => {
    const h = createMarkupHighlighter();
    for (const l of HOSTILE_LINES) assertInvariant(l, h.line(l));
  });

  it("colours the tags of a hostile line, never interpreting them", () => {
    const tokens = createMarkupHighlighter().line("</pre><script>alert(1)</script>");
    expect(tokens.map((t) => t.text).join("")).toBe("</pre><script>alert(1)</script>");
  });
});

describe("Markup robustness", () => {
  it("keeps the invariant on a page", () => {
    const page = ["<!DOCTYPE html>", '<html lang="fr"><head><style>a{b:c}</style></head>', "<body><script>x=1</script></body></html>"];
    expect(runChecked(createMarkupHighlighter(), page)).toBeGreaterThan(0);
  });

  it("survives 2000 random lines (seeded fuzz)", () => {
    const random = seededRandom(23);
    const h = createMarkupHighlighter();
    for (let i = 0; i < 2000; i++) {
      const l = randomLine(random);
      assertInvariant(l, h.line(l));
    }
  });
});

describe("Markup performance", () => {
  const snippet = [
    "<!-- header -->",
    '<div class="card" id="main" data-x=\'1\'>',
    '  <a href="https://example.com/a?b=c">link &amp; more</a>',
    "  <script>",
    "    const a = 1; // c",
    "  </script>",
    "  <style> a { color: red } </style>",
    "</div>",
    "",
  ].join("\n");

  it("highlights 500 000 characters in under 250 ms", () => {
    const rows = repeatToLength(snippet, 500_000).split("\n");
    const h = createMarkupHighlighter();
    const start = performance.now();
    for (const l of rows) h.line(l);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("highlights one 80 000-character line in under 50 ms", () => {
    const l = repeatToLength('<a href="x" b=c>t</a> text ', 80_000);
    const start = performance.now();
    assertInvariant(l, createMarkupHighlighter().line(l));
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("stays linear on pathological lines", () => {
    for (const l of ["<a ".repeat(30_000), "<".repeat(80_000), "<script>".repeat(10_000), "<!--".repeat(20_000), "</script".repeat(10_000)]) {
      const start = performance.now();
      assertInvariant(l, createMarkupHighlighter().line(l));
      expect(performance.now() - start).toBeLessThan(100);
    }
  });
});
