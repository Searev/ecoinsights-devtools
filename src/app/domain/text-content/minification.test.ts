import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { removableShare } from "../models/text-content";
import { MINIFIED_MAX_REMOVABLE_SHARE } from "./policy";
import { createMinificationScanner, measureMinification } from "./minification";

const removable = (text: string) => measureMinification(text).removableCharacters;

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

function scanSplit(text: string, cuts: number[]) {
  const scanner = createMinificationScanner();
  let previous = 0;
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    scanner.feed(text.slice(previous, cut));
    previous = cut;
  }
  scanner.feed(text.slice(previous));
  return scanner.result();
}

describe("createMinificationScanner: line structure (US-021)", () => {
  it("counts the characters of the text", () => {
    expect(measureMinification("a{b:c}")).toEqual({ characters: 6, removableCharacters: 0 });
  });

  it("returns zeros for an empty text", () => {
    expect(measureMinification("")).toEqual({ characters: 0, removableCharacters: 0 });
  });

  it("counts line breaks, indentation and trailing whitespace (scenario 8)", () => {
    expect(measureMinification("a {\n    color: red;  \n}\n")).toEqual({ characters: 24, removableCharacters: 9 });
  });

  it("does not count whitespace between two other characters (scenario 7)", () => {
    expect(removable("var a    =    1;")).toBe(0);
    expect(removable("color: red")).toBe(0);
    expect(removable("a\t\tb\f\fc")).toBe(0);
  });

  it("counts blank lines and CRLF (scenario 9)", () => {
    expect(removable("a\r\n\t\t\r\nb")).toBe(6);
  });

  it("counts every LF and CR as one", () => {
    expect(removable("a\nb")).toBe(1);
    expect(removable("a\rb")).toBe(1);
    expect(removable("a\r\nb")).toBe(2);
  });

  it("counts a leading run on the first line", () => {
    expect(removable("   a")).toBe(3);
  });

  it("counts a trailing run at the end of the text", () => {
    expect(removable("a   ")).toBe(3);
    expect(removable("a;\n\n")).toBe(2);
  });

  it("counts form feeds as whitespace", () => {
    expect(removable("\fa\f")).toBe(2);
  });

  it("counts a whitespace-only text entirely", () => {
    expect(removable("  \n ")).toBe(4);
  });

  it("does not count non-breaking or other Unicode spaces", () => {
    expect(removable("\u00a0a\u2003")).toBe(0);
  });

  it("does not count comments (scenario 6)", () => {
    expect(removable("a=1;/* a long comment */b=2;/* another */")).toBe(0);
    expect(removable("/* x */a=1;")).toBe(0);
    expect(removable("<p>x</p><!-- c -->")).toBe(0);
  });
});

describe("createMinificationScanner: no parser drift (scenario 12)", () => {
  const minified =
    'var r=/["\']/;var a="*/*";var u="http://x";var c="/*";var d="//";f(a,u)'.repeat(800);

  it("counts nothing in a single-line minified bundle", () => {
    expect(minified.length).toBeGreaterThan(50_000);
    expect(removable(minified)).toBe(0);
    expect(removable(minified + "\n")).toBe(1);
  });
});

describe("createMinificationScanner: result()", () => {
  it("can be read at any time and does not alter the scan", () => {
    const scanner = createMinificationScanner();
    scanner.feed("a;  ");
    expect(scanner.result().removableCharacters).toBe(2);
    scanner.feed("b");
    expect(scanner.result()).toEqual({ characters: 5, removableCharacters: 0 });
  });
});

describe("createMinificationScanner: chunking invariance (scenario 13)", () => {
  const adversarial = [
    "a {\n    color: red;  \n}\n",
    "a\r\n\t\t\r\nb",
    "  \n \f\n\r\r\n x  y  \n\n   ",
    "var a    =    1;/* c */  \n",
  ];

  it("gives the same result when split at every single position", () => {
    for (const text of adversarial) {
      const whole = measureMinification(text);
      for (let cut = 0; cut <= text.length; cut++) {
        expect(scanSplit(text, [cut]), `cut ${cut}`).toEqual(whole);
      }
    }
  });

  it("counts a CRLF split across two chunks as 2", () => {
    expect(scanSplit("a\r\nb", [2]).removableCharacters).toBe(2);
  });

  it("gives the same result when fed character by character", () => {
    for (const text of adversarial) {
      const scanner = createMinificationScanner();
      for (const ch of text) scanner.feed(ch);
      expect(scanner.result()).toEqual(measureMinification(text));
    }
  });

  it("gives the same result for random split points over every fixture", () => {
    const fixtures = [
      "color.min.js",
      "color.esm.js",
      "app.min.js",
      "preflight.css",
      "preflight.min.css",
      "page.html",
      "design-tool.svg",
    ];
    const random = prng(42);
    for (const name of fixtures) {
      const text = fixture(name);
      const whole = measureMinification(text);
      for (let round = 0; round < 40; round++) {
        const count = 1 + Math.floor(random() * 25);
        const cuts = Array.from({ length: count }, () => Math.floor(random() * (text.length + 1)));
        expect(scanSplit(text, cuts), `${name} round ${round}`).toEqual(whole);
      }
    }
  });
});

describe("reference fixtures (US-010 scenarios 4 and 5)", () => {
  const share = (name: string) => removableShare(measureMinification(fixture(name)));

  const minified = ["color.min.js", "preflight.min.css", "app.min.js"];
  const notMinified = ["color.esm.js", "preflight.css", "page.html", "design-tool.svg"];

  it.each(minified)("%s is minified", (name) => {
    expect(share(name)).toBeLessThan(MINIFIED_MAX_REMOVABLE_SHARE);
  });

  it.each(notMinified)("%s is not minified", (name) => {
    expect(share(name)).toBeGreaterThanOrEqual(MINIFIED_MAX_REMOVABLE_SHARE);
  });

  it("is at least 3 kB for the HTML page and 2 kB for the SVG", () => {
    expect(fixture("page.html").length).toBeGreaterThanOrEqual(3000);
    expect(fixture("design-tool.svg").length).toBeGreaterThanOrEqual(2000);
  });

  it("counts almost nothing in app.min.js: only the trailing line breaks", () => {
    expect(removable(fixture("app.min.js"))).toBeLessThanOrEqual(3);
  });
});

describe("performance", () => {
  it("scans 5 MB of text in well under 500 ms", () => {
    const unit =
      "/* comment */\nfunction f(a, b) {\n  // note\n  return a + b; /* x */\n}\nvar u = \"http://a.b/c\";\n";
    const text = unit.repeat(Math.ceil(5_000_000 / unit.length));
    expect(text.length).toBeGreaterThanOrEqual(5_000_000);
    measureMinification(text.slice(0, 200_000)); // warm-up
    const start = performance.now();
    const scanner = createMinificationScanner();
    for (let i = 0; i < text.length; i += 262_144) scanner.feed(text.slice(i, i + 262_144));
    const result = scanner.result();
    const elapsed = performance.now() - start;
    console.info(`[perf] 5 MB scanned in ${elapsed.toFixed(1)} ms`);
    expect(result.characters).toBe(text.length);
    expect(elapsed).toBeLessThan(500);
  });
});
