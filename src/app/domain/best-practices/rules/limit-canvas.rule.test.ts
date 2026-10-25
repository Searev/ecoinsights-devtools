// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { formatCount } from "./rule-lines";
import { LimitCanvasPage, limitCanvasRule as rule } from "./limit-canvas.rule";

type C = LimitCanvasPage["canvases"][number];
const canvas = (over: Partial<C> = {}): C => ({ id: null, width: 300, height: 150, ...over });
const ev = (page: LimitCanvasPage | undefined) =>
  rule.evaluate({ url: "https://x.test", requests: [], page, estimates: UNAVAILABLE_ESTIMATES });
const evC = (...items: C[]) => ev({ canvases: items });
const DETAIL = "canvas : vérifier s'ils peuvent être remplacés par des éléments HTML";

describe("limitCanvasRule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(rule.id).toBe("LimitCanvas");
    expect(rule.name).toBe("Limiter l'utilisation des éléments canvas");
    expect(rule.category).toBe("content");
  });
});

describe("limitCanvasRule.evaluate", () => {
  it("scenario 1: no canvas gives A", () => {
    const r = evC();
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucun élément canvas sur la page");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 2: one canvas gives B", () => {
    const r = evC(canvas({ id: "chart", width: 600, height: 400 }));
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe(`1 élément ${DETAIL}`);
    expect(r.offenders).toEqual(['<canvas id="chart"> : 600 × 400 px']);
    expect(r.lineRefs).toBeUndefined();
  });

  it("scenario 3: many canvases are still B, never C", () => {
    const r = evC(...Array.from({ length: 12 }, () => canvas()));
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe(`12 éléments ${DETAIL}`);
    expect(r.offenders).toHaveLength(12);
  });

  it("scenario 3: lines are capped at 20", () => {
    const r = evC(...Array.from({ length: 25 }, () => canvas()));
    expect(r.compliance).toBe("B");
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 5 autres");
    expect(r.lineRefs).toBeUndefined();
  });

  it("scenario 4: hidden canvas counts and comes last", () => {
    const r = evC(canvas({ width: 0, height: 0 }), canvas());
    expect(r.detail).toBe(`2 éléments ${DETAIL}`);
    expect(r.offenders).toEqual(["<canvas> : 300 × 150 px", "<canvas> : non affiché"]);
  });

  it("hidden canvas with an id", () => {
    expect(evC(canvas({ id: "h", width: 0, height: 0 })).offenders).toEqual(['<canvas id="h"> : non affiché']);
  });

  it("orders by area descending, then document order; hidden last in document order", () => {
    const r = evC(
      canvas({ id: "h1", width: 0, height: 0 }),
      canvas({ id: "small", width: 100, height: 100 }),
      canvas({ id: "big", width: 500, height: 400 }),
      canvas({ id: "tie1", width: 100, height: 100 }),
      canvas({ id: "h2", width: 0, height: 0 })
    );
    expect(r.offenders).toEqual([
      '<canvas id="big"> : 500 × 400 px',
      '<canvas id="small"> : 100 × 100 px',
      '<canvas id="tie1"> : 100 × 100 px',
      '<canvas id="h1"> : non affiché',
      '<canvas id="h2"> : non affiché',
    ]);
  });

  it("a box with one zero side is displayed with area 0: after positive areas, before hidden", () => {
    const r = evC(
      canvas({ id: "hidden", width: 0, height: 0 }),
      canvas({ id: "flat", width: 300, height: 0 }),
      canvas({ id: "ok", width: 10, height: 10 })
    );
    expect(r.offenders).toEqual([
      '<canvas id="ok"> : 10 × 10 px',
      '<canvas id="flat"> : 300 × 0 px',
      '<canvas id="hidden"> : non affiché',
    ]);
  });

  it("formats large sizes with French grouping", () => {
    const r = evC(canvas({ width: 1920, height: 1080 }));
    expect(r.offenders).toEqual([`<canvas> : ${formatCount(1920)} × ${formatCount(1080)} px`]);
    expect(r.offenders![0]).toContain(" × ");
  });

  it("scenario 6: without page data: no grade", () => {
    const r = ev(undefined);
    expect(r.compliance).toBeUndefined();
    expect(r.detail).toBe("La page n'a pas pu être inspectée");
  });
});

describe("limitCanvasRule.collect", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  const stub = (el: Element, width: number, height: number) =>
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ top: 0, left: 0, right: 0, bottom: 0, width, height }),
      configurable: true,
    });

  it("scenario 4: reads a displayed and a display:none canvas", () => {
    document.body.innerHTML = `<canvas id="a"></canvas><canvas style="display:none"></canvas>`;
    const [a, b] = Array.from(document.querySelectorAll("canvas"));
    stub(a, 300.4, 149.6);
    stub(b, 0, 0);
    const page = rule.collect!();
    expect(page.canvases).toEqual([
      { id: "a", width: 300, height: 150 },
      { id: null, width: 0, height: 0 },
    ]);
    expect(evC(...page.canvases).offenders).toEqual(['<canvas id="a"> : 300 × 150 px', "<canvas> : non affiché"]);
  });

  it("scenario 5: detached canvases are ignored", () => {
    document.createElement("canvas");
    document.body.innerHTML = `<canvas></canvas>`;
    expect(rule.collect!().canvases).toHaveLength(1);
    document.body.innerHTML = "";
    document.createElement("canvas");
    expect(rule.collect!().canvases).toEqual([]);
  });

  it("canvases in shadow roots are not matched", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.attachShadow({ mode: "open" }).innerHTML = `<canvas></canvas>`;
    expect(rule.collect!().canvases).toEqual([]);
  });

  it("trims ids, blank id is null", () => {
    document.body.innerHTML = `<canvas id=" c "></canvas><canvas id="  "></canvas><canvas></canvas>`;
    expect(rule.collect!().canvases.map((c) => c.id)).toEqual(["c", null, null]);
  });

  it("reads one rect per canvas and never getComputedStyle", () => {
    document.body.innerHTML = `<canvas></canvas><canvas></canvas>`;
    const fn = vi.fn(() => ({ width: 1, height: 2 }));
    document.querySelectorAll("canvas").forEach((c) =>
      Object.defineProperty(c, "getBoundingClientRect", { value: fn, configurable: true })
    );
    const spy = vi.spyOn(window, "getComputedStyle");
    try {
      rule.collect!();
      expect(fn).toHaveBeenCalledTimes(2);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("is self-contained and JSON-serialisable", () => {
    document.body.innerHTML = `<canvas id="x"></canvas>`;
    const rebuilt = new Function(`return (${rule.collect!.toString()})`)();
    expect(() => rebuilt()).not.toThrow();
    const out = rebuilt();
    expect(out.canvases).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("limitCanvasRule performance", () => {
  it("collects and evaluates 200 canvases within budget", () => {
    document.body.innerHTML = Array.from({ length: 200 }, (_, i) => `<canvas id="c${i}"></canvas>`).join("");
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
    console.log(`NFR LimitCanvas best of 10: ${ms.toFixed(2)} ms`);
    expect(r.compliance).toBe("B");
    expect(ms).toBeLessThan(10);
  });
});

describe("limitCanvasRule indicator (US-029)", () => {
  const unit = "canvas-elements" as const;

  it("no canvas gives a count of 0", () => {
    expect(evC().indicator).toEqual({ kind: "count", offenders: 0, unit });
  });

  it("one canvas gives a count of 1", () => {
    expect(evC(canvas()).indicator).toEqual({ kind: "count", offenders: 1, unit });
  });

  it("more than 20 canvases give the full count", () => {
    const r = evC(...Array.from({ length: 30 }, () => canvas()));
    expect(r.indicator).toEqual({ kind: "count", offenders: 30, unit });
  });

  it("sets no indicator when the page could not be inspected", () => {
    expect(ev(undefined).indicator).toBeUndefined();
  });
});
