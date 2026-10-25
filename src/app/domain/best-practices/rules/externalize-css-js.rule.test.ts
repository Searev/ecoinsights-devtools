// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { ExternalizeCssJsPage, externalizeCssJsRule as rule } from "./externalize-css-js.rule";

type Block = ExternalizeCssJsPage["blocks"][number];
const style = (size: number, id: string | null = null): Block => ({ tag: "style", id, size });
const script = (size: number, id: string | null = null): Block => ({ tag: "script", id, size });
const ev = (page: ExternalizeCssJsPage | undefined) =>
  rule.evaluate({ url: "https://x.test", requests: [], page, estimates: UNAVAILABLE_ESTIMATES });
const evB = (...blocks: Block[]) => ev({ blocks });
const many = (n: number, size = 100): Block[] => Array.from({ length: n }, () => script(size));

describe("externalizeCssJsRule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(rule.id).toBe("ExternalizeCssJs");
    expect(rule.name).toBe("Externaliser les CSS et JavaScript");
    expect(rule.category).toBe("js");
  });
});

describe("externalizeCssJsRule.evaluate", () => {
  it("scenario 1: no inline code gives A", () => {
    const r = evB();
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucun CSS ni JavaScript en ligne");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 2: 2 blocks give A, without lines", () => {
    const r = evB(style(10), script(10));
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("2 blocs CSS ou JavaScript en ligne");
    expect(r.offenders).toBeUndefined();
  });

  it("singular for one block", () => {
    const r = evB(style(10));
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("1 bloc CSS ou JavaScript en ligne");
  });

  it("scenario 3: boundaries of B (3 and 5)", () => {
    expect(evB(...many(3)).compliance).toBe("B");
    expect(evB(...many(5)).compliance).toBe("B");
  });

  it("boundary: 6 gives C", () => {
    expect(evB(...many(6)).compliance).toBe("C");
  });

  it("scenario 4: C with detail and ordered lines", () => {
    const r = evB(
      style(1000),
      script(12000),
      script(300, "gtm"),
      style(400),
      script(300),
      script(50)
    );
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe(
      "6 blocs CSS ou JavaScript en ligne (2 <style>, 4 <script>) : à externaliser dans des fichiers mis en cache"
    );
    expect(r.offenders).toEqual([
      "<script> en ligne : 12 ko",
      "<style> en ligne : 1 ko",
      "<style> en ligne : 0,4 ko",
      '<script id="gtm"> en ligne : 0,3 ko',
      "<script> en ligne : 0,3 ko",
      "<script> en ligne : 0,1 ko",
    ]);
    expect(r.lineRefs).toBeUndefined();
  });

  it("B detail uses the same format", () => {
    const r = evB(style(10), script(10), script(10));
    expect(r.detail).toBe(
      "3 blocs CSS ou JavaScript en ligne (1 <style>, 2 <script>) : à externaliser dans des fichiers mis en cache"
    );
    expect(r.offenders).toHaveLength(3);
  });

  it("sizes show at most one decimal", () => {
    const r = evB(script(12345), script(12000), script(1000), script(400), script(50));
    expect(r.offenders).toEqual([
      "<script> en ligne : 12,3 ko",
      "<script> en ligne : 12 ko",
      "<script> en ligne : 1 ko",
      "<script> en ligne : 0,4 ko",
      "<script> en ligne : 0,1 ko",
    ]);
  });

  it("caps at 20 lines", () => {
    const r = evB(...many(25));
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 5 autres");
    expect(r.lineRefs).toBeUndefined();
  });

  it("scenario 8: without page data, no grade", () => {
    const r = ev(undefined);
    expect(r.compliance).toBeUndefined();
    expect(r.detail).toBe("La page n'a pas pu être inspectée");
  });
});

describe("externalizeCssJsRule.collect", () => {
  const collect = () => rule.collect!().blocks;
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("scenario 1: external resources only", () => {
    document.head.innerHTML = `<link rel="stylesheet" href="/a.css"><script src="/a.js"></script>`;
    expect(collect()).toEqual([]);
  });

  it("scenario 5: only inline JavaScript is counted", () => {
    document.body.innerHTML = `
      <script type="application/ld+json">{"a":1}</script>
      <script type="importmap">{"imports":{}}</script>
      <script type="text/template"><p>x</p></script>
      <script src="/a.js"></script>
      <script src="/b.js"></script>
      <script type="module">import "/x.js";</script>`;
    expect(collect()).toEqual([{ tag: "script", id: null, size: 15 }]);
  });

  it("script with src is skipped even when it has text or an empty src", () => {
    document.body.innerHTML = `<script src="/a.js">var a = 1;</script><script src="">var b = 2;</script>`;
    expect(collect()).toEqual([]);
  });

  it("type matrix", () => {
    const types: Array<[string | null, boolean]> = [
      [null, true],
      ["", true],
      ["module", true],
      ["MODULE", true],
      [" Text/JavaScript ", true],
      ["text/javascript; charset=utf-8", true],
      ["application/javascript", true],
      ["application/ecmascript", true],
      ["text/ecmascript", true],
      ["application/x-javascript", true],
      ["importmap", false],
      ["speculationrules", false],
      ["text/x-template", false],
      ["text/template", false],
      ["application/json", false],
      ["application/ld+json", false],
    ];
    for (const [type, counted] of types) {
      document.body.innerHTML = "";
      const s = document.createElement("script");
      if (type !== null) s.setAttribute("type", type);
      s.textContent = "var a;";
      document.body.appendChild(s);
      expect(collect().length, String(type)).toBe(counted ? 1 : 0);
    }
  });

  it("language attribute is ignored", () => {
    document.body.innerHTML = `<script language="vbscript">x</script>`;
    expect(collect()).toHaveLength(1);
  });

  it("scenario 6: empty and whitespace-only blocks are ignored", () => {
    document.head.innerHTML = `<style></style>`;
    document.body.innerHTML = `<script>   \n\t </script>`;
    expect(collect()).toEqual([]);
  });

  it("scenario 7: styles injected before collection are counted", () => {
    document.head.innerHTML = `<style>a{}</style>`;
    for (let i = 0; i < 4; i++) {
      const s = document.createElement("style");
      s.textContent = `.c${i}{color:red}`;
      document.head.appendChild(s);
    }
    const blocks = collect();
    expect(blocks).toHaveLength(5);
    expect(blocks.every((b) => b.tag === "style")).toBe(true);
  });

  it("reads tag, trimmed id and size, in document order", () => {
    document.head.innerHTML = `<style id=" main ">abcd</style>`;
    document.body.innerHTML = `<script id="  ">12345</script><script id="gtm">1</script>`;
    expect(collect()).toEqual([
      { tag: "style", id: "main", size: 4 },
      { tag: "script", id: null, size: 5 },
      { tag: "script", id: "gtm", size: 1 },
    ]);
  });

  it("counts svg style elements", () => {
    document.body.innerHTML = `<svg><style>.a{fill:red}</style></svg>`;
    expect(collect()).toEqual([{ tag: "style", id: null, size: 12 }]);
  });

  it("is self-contained and JSON-serialisable", () => {
    document.body.innerHTML = `<script id="a">var a = 1;</script><style>a{}</style>`;
    const rebuilt = new Function(`return (${rule.collect!.toString()})`)();
    expect(() => rebuilt()).not.toThrow();
    const out = rebuilt();
    expect(out.blocks).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("externalizeCssJsRule performance", () => {
  it("collects and evaluates 500 elements within budget", () => {
    document.head.innerHTML = "";
    document.body.innerHTML = Array.from({ length: 500 }, (_, i) =>
      i % 2 ? `<script>var a${i} = ${i};</script>` : `<style>.c${i}{color:red}</style>`
    ).join("");
    const run = () =>
      rule.evaluate({ url: "", requests: [], page: rule.collect!(), estimates: UNAVAILABLE_ESTIMATES });
    run();
    let ms = Infinity;
    let r = run();
    for (let k = 0; k < 10; k++) {
      const t0 = performance.now();
      r = run();
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(r.compliance).toBe("C");
    expect(ms).toBeLessThan(20);
  });

  it("evaluates 500 collected blocks alone within budget", () => {
    const page: ExternalizeCssJsPage = { blocks: Array.from({ length: 500 }, (_, i) => script(i + 1)) };
    const run = () => rule.evaluate({ url: "", requests: [], page, estimates: UNAVAILABLE_ESTIMATES });
    run();
    let ms = Infinity;
    for (let k = 0; k < 10; k++) {
      const t0 = performance.now();
      run();
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(ms).toBeLessThan(20);
  });
});
