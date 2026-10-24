// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { LineHighlighter, LineToken } from "./syntax/syntax-types";
import { TEXT_VIEW_SLICE_MS, renderTextView, type TextViewOptions } from "./text-view-renderer";

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function makeEnv(step = 0) {
  let t = 0;
  const queue: Array<() => void> = [];
  return {
    queue,
    options(extra: Partial<TextViewOptions> = {}): TextViewOptions {
      return {
        schedule: (task) => queue.push(task),
        now: () => {
          t += step;
          return t;
        },
        ...extra,
      };
    },
    /** Runs queued tasks until empty (or limit). */
    async drain(limit = 100000) {
      let n = 0;
      await flush();
      while (queue.length > 0 && n++ < limit) {
        queue.shift()!();
        await flush();
      }
    },
    runOne() {
      queue.shift()?.();
    },
  };
}

const container = () => document.createElement("div");
const rows = (c: HTMLElement) => Array.from(c.querySelectorAll(".text-row"));
const codeTexts = (c: HTMLElement) =>
  rows(c).map((r) => r.querySelector(".text-code")!.textContent);

const kindAll = (kind: LineToken["kind"]): LineHighlighter => ({
  line: (text) => [{ text, kind }],
});


describe("renderTextView rows", () => {
  it("exposes the slice constant", () => {
    expect(TEXT_VIEW_SLICE_MS).toBe(12);
  });

  it("renders one row per line with a text-less aria-hidden gutter", async () => {
    const env = makeEnv();
    const c = container();
    c.appendChild(document.createElement("p"));
    const view = renderTextView(c, ["a", "", "c"], env.options());
    await env.drain();
    await view.settled;
    expect(rows(c)).toHaveLength(3);
    rows(c).forEach((r, i) => {
      const g = r.children[0] as HTMLElement;
      expect(g.className).toBe("text-gutter");
      expect(g.getAttribute("aria-hidden")).toBe("true");
      expect(g.getAttribute("data-line")).toBe(String(i + 1));
      expect(g.childNodes).toHaveLength(0);
      expect((r.children[1] as HTMLElement).className).toBe("text-code");
    });
    expect(codeTexts(c)).toEqual(["a", "", "c"]);
    expect(rows(c)[1].querySelector(".text-code")!.childNodes).toHaveLength(0);
    expect(c.querySelector("p")).toBeNull();
  });

  it("renders the first slice synchronously, at least one row per slice", async () => {
    const env = makeEnv(5);
    const c = container();
    const lines = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const view = renderTextView(c, lines, env.options());
    const first = rows(c).length;
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThan(20);
    let previous = first;
    while (env.queue.length > 0 && rows(c).length < 20) {
      env.runOne();
      expect(rows(c).length).toBeGreaterThan(previous);
      previous = rows(c).length;
    }
    await env.drain();
    await view.settled;
    expect(rows(c)).toHaveLength(20);
  });

  it("renders an 80 000-character line as one row", async () => {
    const env = makeEnv();
    const c = container();
    const line = "x".repeat(80000);
    const view = renderTextView(c, [line], env.options());
    await env.drain();
    await view.settled;
    expect(rows(c)).toHaveLength(1);
    expect(rows(c)[0].children[0].getAttribute("data-line")).toBe("1");
    expect(c.textContent).toBe(line);
  });

  it("colours a line of 300 000 one-character tokens (no argument-spread limit)", async () => {
    const env = makeEnv();
    const c = container();
    const line = "ab".repeat(150000);
    const alternating: LineHighlighter = {
      line: (text) => Array.from(text, (ch, i) => ({ text: ch, kind: i % 2 === 0 ? "keyword" : undefined })),
    };
    const view = renderTextView(c, [line], env.options({ highlighter: async () => alternating }));
    await env.drain();
    await view.settled;
    expect(c.querySelectorAll(".syntax-keyword")).toHaveLength(150000);
    expect(c.textContent).toBe(line);
  });

  it("completes 20 000 lines", async () => {
    const env = makeEnv(0.001);
    const c = container();
    const lines = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
    const view = renderTextView(c, lines, env.options({ highlighter: async () => kindAll(undefined) }));
    await env.drain();
    await view.settled;
    expect(rows(c)).toHaveLength(20000);
  });
});

describe("renderTextView colouring", () => {
  it("colours tokens and keeps the text identical", async () => {
    const env = makeEnv();
    const c = container();
    const lines = ["let x = 1", "// c"];
    const hl: LineHighlighter = {
      line: (t) =>
        t.startsWith("let")
          ? [{ text: "let", kind: "keyword" }, { text: " x = " }, { text: "1", kind: "number" }]
          : [{ text: t, kind: "comment" }],
    };
    const view = renderTextView(c, lines, env.options({ highlighter: async () => hl }));
    await env.drain();
    await view.settled;
    const code = rows(c)[0].querySelector(".text-code")!;
    expect(code.children).toHaveLength(2);
    expect(code.children[0].className).toBe("syntax-keyword");
    expect(code.children[1].className).toBe("syntax-number");
    expect(code.childNodes[1].nodeType).toBe(Node.TEXT_NODE);
    expect(rows(c)[1].querySelector(".syntax-comment")!.textContent).toBe("// c");
    expect(codeTexts(c)).toEqual(lines);
  });

  it("leaves rows without any kind untouched", async () => {
    const env = makeEnv();
    const c = container();
    const view = renderTextView(c, ["abc"], env.options({ highlighter: async () => kindAll(undefined) }));
    const node = rows(c)[0].querySelector(".text-code")!.firstChild;
    await env.drain();
    await view.settled;
    expect(rows(c)[0].querySelector(".text-code")!.firstChild).toBe(node);
  });

  it("calls the highlighter factory right away", () => {
    const env = makeEnv();
    let called = 0;
    renderTextView(container(), ["a"], env.options({ highlighter: async () => { called++; return undefined; } }));
    expect(called).toBe(1);
  });

  it("stays plain when the highlighter rejects or returns undefined", async () => {
    for (const highlighter of [
      () => Promise.reject(new Error("x")),
      async () => undefined,
    ]) {
      const env = makeEnv();
      const c = container();
      const view = renderTextView(c, ["a", "b"], env.options({ highlighter }));
      await env.drain();
      await view.settled;
      expect(c.querySelector("[class^=syntax-]")).toBeNull();
      expect(codeTexts(c)).toEqual(["a", "b"]);
    }
  });

  it("stops colouring when the factory throws synchronously", async () => {
    const env = makeEnv();
    const c = container();
    const view = renderTextView(c, ["a"], env.options({ highlighter: () => { throw new Error("x"); } }));
    await env.drain();
    await view.settled;
    expect(codeTexts(c)).toEqual(["a"]);
  });

  it("stops colouring for good when the highlighter throws on line 3", async () => {
    const env = makeEnv();
    const c = container();
    let n = 0;
    const hl: LineHighlighter = {
      line: (text) => {
        n++;
        if (n === 3) throw new Error("boom");
        return [{ text, kind: "string" }];
      },
    };
    const view = renderTextView(c, ["1", "2", "3", "4", "5"], env.options({ highlighter: async () => hl }));
    await env.drain();
    await view.settled;
    expect(n).toBe(3);
    expect(c.querySelectorAll(".syntax-string")).toHaveLength(2);
    expect(codeTexts(c)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("stops colouring on a token mismatch", async () => {
    const env = makeEnv();
    const c = container();
    const hl: LineHighlighter = {
      line: (text) => (text === "2" ? [{ text: "oops", kind: "string" }] : [{ text, kind: "string" }]),
    };
    const view = renderTextView(c, ["1", "2", "3"], env.options({ highlighter: async () => hl }));
    await env.drain();
    await view.settled;
    expect(c.querySelectorAll(".syntax-string")).toHaveLength(1);
    expect(codeTexts(c)).toEqual(["1", "2", "3"]);
  });

  it("colours in several slices", async () => {
    const env = makeEnv(5);
    const c = container();
    const lines = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const view = renderTextView(c, lines, env.options({ highlighter: async () => kindAll("string") }));
    await env.drain();
    await view.settled;
    expect(c.querySelectorAll(".syntax-string")).toHaveLength(30);
  });
});

describe("renderTextView cancel", () => {
  it("cancel during the plain pass freezes the DOM and settles", async () => {
    const env = makeEnv(5);
    const c = container();
    const view = renderTextView(c, Array.from({ length: 50 }, () => "x"), env.options());
    env.runOne();
    const count = rows(c).length;
    view.cancel();
    view.cancel();
    await env.drain();
    await view.settled;
    expect(rows(c)).toHaveLength(count);
    expect(count).toBeLessThan(50);
  });

  it("cancel during the colouring pass freezes the DOM", async () => {
    const env = makeEnv(5);
    const c = container();
    const lines = Array.from({ length: 40 }, () => "x");
    const view = renderTextView(c, lines, env.options({ highlighter: async () => kindAll("string") }));
    // finish plain pass
    while (rows(c).length < 40) env.runOne();
    await flush();
    env.runOne();
    const coloured = c.querySelectorAll(".syntax-string").length;
    expect(coloured).toBeGreaterThan(0);
    expect(coloured).toBeLessThan(40);
    view.cancel();
    await env.drain();
    await view.settled;
    expect(c.querySelectorAll(".syntax-string")).toHaveLength(coloured);
  });
});

describe("renderTextView hostile content", () => {
  const hostile = [
    "</pre><script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "</pre><style>body{display:none}</style>",
    '<a href="javascript:alert(1)">x</a>',
    "<iframe src=x></iframe><link rel=stylesheet href=x><object data=x></object>",
  ];
  for (const [name, highlighter] of [
    ["no highlighter", undefined],
    ["tag highlighter", async () => kindAll("tag")],
  ] as const) {
    it(`never creates elements from text (${name})`, async () => {
      const env = makeEnv();
      const c = container();
      const view = renderTextView(c, hostile, env.options({ highlighter }));
      await env.drain();
      await view.settled;
      expect(c.querySelector("script, img, style, a, iframe, link, object")).toBeNull();
      expect(codeTexts(c)).toEqual(hostile);
    });
  }
});
