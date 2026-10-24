import { describe, expect, it } from "vitest";
import { createJsonHighlighter } from "./json";
import {
  HOSTILE_LINES, assertInvariant, coloured, randomLine, repeatToLength, runChecked, seededRandom,
} from "./test-kit";

const line = (text: string) => coloured(createJsonHighlighter().line(text));

describe("JSON tokens", () => {
  it("colours keys, string values, numbers and literals", () => {
    expect(line('  "name": "ecoindex", "n": -12.5e3, "ok": true, "x": null, "y": false')).toEqual([
      'key:"name"', 'string:"ecoindex"', 'key:"n"', "number:-12.5e3", 'key:"ok"', "literal:true",
      'key:"x"', "literal:null", 'key:"y"', "literal:false",
    ]);
  });

  it("recognises a key followed by spaces and a colon", () => {
    expect(line('"a"   : 1')).toEqual(['key:"a"', "number:1"]);
  });

  it("treats strings in arrays as values", () => {
    expect(line('["a", "b"]')).toEqual(['string:"a"', 'string:"b"']);
  });

  it("handles escapes and unterminated strings", () => {
    expect(line('"a\\"b": 1')).toEqual(['key:"a\\"b"', "number:1"]);
    expect(line('"abc')).toEqual(['string:"abc']);
  });

  it("is lenient on invalid JSON", () => {
    expect(line("{ a: 1, 'b': tru }")).toEqual(["number:1"]);
  });

  it("keeps words containing a literal plain", () => {
    expect(line("nullable truest")).toEqual([]);
  });

  it("has no state between lines", () => {
    const h = createJsonHighlighter();
    h.line('"open');
    expect(coloured(h.line("1"))).toEqual(["number:1"]);
  });
});

describe("JSON robustness", () => {
  it("keeps the invariant on a document", () => {
    const doc = ["{", '  "a": [1, 2, {"b": "c"}],', '  "d": {}', "}"];
    expect(runChecked(createJsonHighlighter(), doc)).toBeGreaterThan(0);
  });

  it("survives hostile lines and a seeded fuzz", () => {
    const h = createJsonHighlighter();
    for (const l of HOSTILE_LINES) assertInvariant(l, h.line(l));
    const random = seededRandom(21);
    for (let i = 0; i < 2000; i++) {
      const l = randomLine(random);
      assertInvariant(l, h.line(l));
    }
  });
});

describe("JSON performance", () => {
  it("highlights 500 000 characters in under 250 ms", () => {
    const snippet = '{\n  "id": 12,\n  "name": "item",\n  "tags": ["a", "b"],\n  "ok": true\n},\n';
    const lines = repeatToLength(snippet, 500_000).split("\n");
    const h = createJsonHighlighter();
    const start = performance.now();
    for (const l of lines) h.line(l);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("highlights one 80 000-character line in under 50 ms", () => {
    const l = repeatToLength('"k": "v", "n": 1.5, ', 80_000);
    const h = createJsonHighlighter();
    const start = performance.now();
    assertInvariant(l, h.line(l));
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("stays linear with strings followed by long whitespace", () => {
    const l = repeatToLength('"a"' + " ".repeat(200), 80_000);
    const start = performance.now();
    assertInvariant(l, createJsonHighlighter().line(l));
    expect(performance.now() - start).toBeLessThan(100);
  });
});
