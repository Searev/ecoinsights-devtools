import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { removableShare, TextFileType } from "../models/text-content";
import { MINIFIED_MAX_REMOVABLE_SHARE } from "./policy";
import { createMinificationScanner, measureMinification } from "./minification";

const removable = (text: string, type: TextFileType) => measureMinification(text, type).removableCharacters;

const fixture = (name: string) =>
  readFileSync(new URL(`./testing/fixtures/${name}`, import.meta.url), "utf-8");

/** Small deterministic PRNG (mulberry32) so the property test is reproducible. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scanSplit(text: string, type: TextFileType, cuts: number[]) {
  const scanner = createMinificationScanner(type);
  let previous = 0;
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    scanner.feed(text.slice(previous, cut));
    previous = cut;
  }
  scanner.feed(text.slice(previous));
  return scanner.result();
}

describe("createMinificationScanner: counting", () => {
  it("counts the characters of the text", () => {
    expect(measureMinification("a{b:c}", "CSS")).toEqual({ characters: 6, removableCharacters: 0 });
  });

  it("returns zeros for an empty text", () => {
    expect(measureMinification("", "JS")).toEqual({ characters: 0, removableCharacters: 0 });
  });

  it("does not count a single separating space", () => {
    expect(removable("var a=1;", "JS")).toBe(0);
    expect(removable("@media screen{a{b:c}}", "CSS")).toBe(0);
  });

  it("counts a run of spaces as its length minus one", () => {
    expect(removable("a    b", "JS")).toBe(3);
    expect(removable("a\t\tb", "CSS")).toBe(1);
  });

  it("counts a run containing a line break as its whole length", () => {
    expect(removable("a \n  b", "JS")).toBe(4);
    expect(removable("a\nb", "JS")).toBe(1);
    expect(removable("a\r\nb", "CSS")).toBe(2);
  });

  it("counts form feeds as whitespace", () => {
    expect(removable("a\f\fb", "JS")).toBe(1);
  });

  it("counts a trailing whitespace run at the end of the text", () => {
    expect(removable("a;\n\n", "JS")).toBe(2);
  });
});

describe("createMinificationScanner: comments", () => {
  it("counts a CSS block comment entirely", () => {
    expect(removable("a{b:c}/* hi */", "CSS")).toBe("/* hi */".length);
  });

  it("counts a JS block comment and a JS line comment", () => {
    expect(removable("a=1;/* x */b=2;", "JS")).toBe("/* x */".length);
    // "// x" (4) plus the line break (1)
    expect(removable("a=1;// x\nb=2;", "JS")).toBe(5);
  });

  it("does not treat // as a comment in CSS", () => {
    expect(removable("a{background:url(http://a.b/c.png)}", "CSS")).toBe(0);
  });

  it("counts an unterminated block comment up to the end", () => {
    expect(removable("a;/* never closed", "JS")).toBe("/* never closed".length);
  });

  it("counts a line comment at the end of the text without a line break", () => {
    expect(removable("a;//end", "JS")).toBe("//end".length);
  });

  it("counts HTML and SVG comments", () => {
    expect(removable("<p>x</p><!-- c -->", "HTML")).toBe("<!-- c -->".length);
    expect(removable("<g/><!-- c -->", "SVG")).toBe("<!-- c -->".length);
  });

  it("does not treat -- inside an HTML comment as its end", () => {
    expect(removable("<!-- a -- b -->", "HTML")).toBe("<!-- a -- b -->".length);
  });

  it("does not treat /* as a comment in HTML", () => {
    expect(removable("<p>/* x */</p>", "HTML")).toBe(0);
  });

  it("keeps licence comments starting with /*!", () => {
    expect(removable("/*! lib v1.0 | MIT */a=1;", "JS")).toBe(0);
    expect(removable("/*! lib */a{b:c}", "CSS")).toBe(0);
  });

  it("keeps comments containing @license or @preserve", () => {
    expect(removable("/* @license MIT */a=1;", "JS")).toBe(0);
    expect(removable("/**\n * foo\n * @preserve\n */a=1;", "JS")).toBe(0);
    expect(removable("<!-- @license MIT -->", "HTML")).toBe(0);
  });

  it("keeps source map comments", () => {
    expect(removable("a=1;\n//# sourceMappingURL=a.js.map", "JS")).toBe(1);
    expect(removable("a=1;\n//@ sourceMappingURL=a.js.map", "JS")).toBe(1);
    expect(removable("a{b:c}\n/*# sourceMappingURL=a.css.map */", "CSS")).toBe(1);
  });

  it("does not keep an ordinary comment that merely mentions sourceMappingURL later", () => {
    expect(removable("// see sourceMappingURL=a", "JS")).toBe("// see sourceMappingURL=a".length);
  });
});

describe("createMinificationScanner: strings", () => {
  it("does not read // inside a JS string as a comment", () => {
    expect(removable('var u="http://a.b/c";var v=1;', "JS")).toBe(0);
    expect(removable("var u='http://a.b/c';", "JS")).toBe(0);
  });

  it("does not count whitespace inside strings", () => {
    expect(removable('var s="a    b";', "JS")).toBe(0);
    expect(removable("a{content:'x   y'}", "CSS")).toBe(0);
  });

  it("honours backslash escapes", () => {
    expect(removable('var s="a\\"//b  c";', "JS")).toBe(0);
  });

  it("reads template literals across line breaks", () => {
    expect(removable("var t=`a\n   // b\n  c`;", "JS")).toBe(0);
  });

  it("ends ' and \" strings at a line break", () => {
    // "\n" (1) then "// c" (4)
    expect(removable("'abc\n// c", "JS")).toBe(5);
  });

  it("allows an escaped line break inside a string", () => {
    expect(removable('var s="a\\\n   b";', "JS")).toBe(0);
  });

  it("does not read /* inside a CSS string as a comment", () => {
    expect(removable('a{content:"/*"}b{c:d}', "CSS")).toBe(0);
  });

  it("does not treat quotes as strings in HTML", () => {
    expect(removable("<p>it's  <!-- c --></p>", "HTML")).toBe(1 + "<!-- c -->".length);
  });
});

describe("createMinificationScanner: result()", () => {
  it("can be read at any time and does not alter the scan", () => {
    const scanner = createMinificationScanner("JS");
    scanner.feed("a;  ");
    expect(scanner.result().removableCharacters).toBe(1);
    scanner.feed("b");
    expect(scanner.result()).toEqual({ characters: 5, removableCharacters: 1 });
  });
});

describe("createMinificationScanner: chunking invariance", () => {
  const adversarial: Array<[string, TextFileType]> = [
    ["a=1;/*! x */b=2;  /* @license y */ c=3;\n//# sourceMappingURL=a.map\n", "JS"],
    ["x=1;// @preserve\ny=2; // z\n  \n z", "JS"],
    ["a{b:c}  /*# sourceMappingURL=a.css.map */ /* c */\n\n", "CSS"],
    ["<p>  a</p>\n<!-- c -->\n<!-- @license x -->  <!--! n --><!-->z", "HTML"],
    ['var u="http://a//b\\"  c";\'q\n//e\n`t  \n//u`;/', "JS"],
    ["<<!<!-<!--<!---->-->- -->x", "SVG"],
  ];

  it("gives the same result when split at every single position", () => {
    for (const [text, type] of adversarial) {
      const whole = measureMinification(text, type);
      for (let cut = 0; cut <= text.length; cut++) {
        expect(scanSplit(text, type, [cut]), `${type} cut ${cut}`).toEqual(whole);
      }
    }
  });

  it("gives the same result when fed character by character", () => {
    for (const [text, type] of adversarial) {
      const scanner = createMinificationScanner(type);
      for (const ch of text) scanner.feed(ch);
      expect(scanner.result()).toEqual(measureMinification(text, type));
    }
  });

  it("gives the same result for random split points over every fixture", () => {
    const fixtures: Array<[string, TextFileType]> = [
      ["color.min.js", "JS"],
      ["color.esm.js", "JS"],
      ["app.min.js", "JS"],
      ["preflight.css", "CSS"],
      ["preflight.min.css", "CSS"],
      ["page.html", "HTML"],
      ["design-tool.svg", "SVG"],
    ];
    const random = prng(42);
    for (const [name, type] of fixtures) {
      const text = fixture(name);
      const whole = measureMinification(text, type);
      for (let round = 0; round < 40; round++) {
        const count = 1 + Math.floor(random() * 25);
        const cuts = Array.from({ length: count }, () => Math.floor(random() * (text.length + 1)));
        expect(scanSplit(text, type, cuts), `${name} round ${round}`).toEqual(whole);
      }
    }
  });
});

describe("reference fixtures (US-010 scenarios 4 and 5)", () => {
  const share = (name: string, type: TextFileType) => removableShare(measureMinification(fixture(name), type));

  const minified: Array<[string, TextFileType]> = [
    ["color.min.js", "JS"],
    ["preflight.min.css", "CSS"],
    ["app.min.js", "JS"],
  ];
  const notMinified: Array<[string, TextFileType]> = [
    ["color.esm.js", "JS"],
    ["preflight.css", "CSS"],
    ["page.html", "HTML"],
    ["design-tool.svg", "SVG"],
  ];

  it.each(minified)("%s is minified", (name, type) => {
    expect(share(name, type)).toBeLessThan(MINIFIED_MAX_REMOVABLE_SHARE);
  });

  it.each(notMinified)("%s is not minified", (name, type) => {
    expect(share(name, type)).toBeGreaterThanOrEqual(MINIFIED_MAX_REMOVABLE_SHARE);
  });

  it("is at least 3 kB for the HTML page and 2 kB for the SVG", () => {
    expect(fixture("page.html").length).toBeGreaterThanOrEqual(3000);
    expect(fixture("design-tool.svg").length).toBeGreaterThanOrEqual(2000);
  });

  it("classifies the licence header and source map footer of app.min.js as kept", () => {
    const text = fixture("app.min.js");
    expect(text.startsWith("/*! lib v1.0 | MIT */")).toBe(true);
    expect(text.trimEnd().endsWith("//# sourceMappingURL=app.js.map")).toBe(true);
    // only the trailing line breaks count
    expect(removable(text, "JS")).toBeLessThanOrEqual(3);
  });
});

describe("performance", () => {
  it("scans 5 MB of text in well under 500 ms", () => {
    const unit =
      "/* comment */\nfunction f(a, b) {\n  // note\n  return a + b; /* x */\n}\nvar u = \"http://a.b/c\";\n";
    const text = unit.repeat(Math.ceil(5_000_000 / unit.length));
    expect(text.length).toBeGreaterThanOrEqual(5_000_000);
    measureMinification(text.slice(0, 200_000), "JS"); // warm-up
    const start = performance.now();
    const scanner = createMinificationScanner("JS");
    for (let i = 0; i < text.length; i += 262_144) scanner.feed(text.slice(i, i + 262_144));
    const result = scanner.result();
    const elapsed = performance.now() - start;
    console.info(`[perf] 5 MB scanned in ${elapsed.toFixed(1)} ms`);
    expect(result.characters).toBe(text.length);
    expect(elapsed).toBeLessThan(500);
  });
});
