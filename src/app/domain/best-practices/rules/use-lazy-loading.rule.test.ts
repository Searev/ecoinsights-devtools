// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { LazyElement, UseLazyLoadingPage, useLazyLoadingRule as rule } from "./use-lazy-loading.rule";
import { formatCount } from "./rule-lines";

const el = (over: Partial<LazyElement> = {}): LazyElement => ({
  kind: "img",
  url: "https://x.test/a.jpg",
  top: 1500,
  rendered: true,
  loading: null,
  scriptLazy: false,
  dataUri: false,
  trackingPixel: false,
  ...over,
});
const ev = (page: UseLazyLoadingPage | undefined) =>
  rule.evaluate({ url: "https://x.test", requests: [], page, estimates: UNAVAILABLE_ESTIMATES });
const evEls = (...elements: LazyElement[]) => ev({ viewportHeight: 800, elements });

describe("useLazyLoadingRule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(rule.id).toBe("UseLazyLoading");
    expect(rule.name).toBe("Utiliser le chargement paresseux");
    expect(rule.category).toBe("images");
  });
});

describe("useLazyLoadingRule.evaluate", () => {
  it("scenario 1: lazy images below the fold give A", () => {
    const r = evEls(
      el({ top: 1200, loading: "lazy" }),
      el({ url: "https://x.test/b.jpg", top: 2400, loading: " LAZY " })
    );
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucune image ni iframe hors de l'écran initial chargée immédiatement");
  });

  it("scenario 2: above-the-fold image is excluded", () => {
    const r = evEls(el({ top: 100 }));
    expect(r.compliance).toBe("A");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 3: one eager image gives B", () => {
    const r = evEls(el({ url: "https://x.test/img/photo.jpg" }));
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([
      `photo.jpg : chargée immédiatement (située à ${formatCount(1500)} px du haut de page)`,
    ]);
    expect(r.lineRefs).toEqual([{ url: "https://x.test/img/photo.jpg", preview: { kind: "image" } }]);
    expect(r.detail).toBe("1 image ou iframe hors de l'écran initial chargée immédiatement");
  });

  it("scenario 4: two eager elements give C, iframe prefixed", () => {
    const r = evEls(
      el({ top: 2000 }),
      el({ kind: "iframe", url: "https://x.test/embed/player", top: 1000 })
    );
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([
      `Iframe player : chargée immédiatement (située à ${formatCount(1000)} px du haut de page)`,
      `a.jpg : chargée immédiatement (située à ${formatCount(2000)} px du haut de page)`,
    ]);
    expect(r.lineRefs![0]).toEqual({
      url: "https://x.test/embed/player",
      prefix: "Iframe ",
      preview: { kind: "iframe", top: 1000 },
    });
    expect(r.detail).toBe("2 images ou iframes hors de l'écran initial chargées immédiatement");
  });

  it("eager attribute and absent attribute are offenders", () => {
    expect(evEls(el({ loading: "eager" })).compliance).toBe("B");
    expect(evEls(el({ loading: "bogus" })).compliance).toBe("B");
  });

  it("scenario 6: script-based lazy loading counts as lazy", () => {
    expect(evEls(el({ scriptLazy: true })).compliance).toBe("A");
  });

  it("scenario 7: hidden, data URI and tracking pixels are ignored", () => {
    const r = evEls(
      el({ rendered: false }),
      el({ dataUri: true, url: "data:image/png;base64,AAAA" }),
      el({ trackingPixel: true })
    );
    expect(r.compliance).toBe("A");
  });

  it("ignores iframes and images without an http(s) URL", () => {
    const r = evEls(
      el({ kind: "iframe", url: "about:blank" }),
      el({ kind: "iframe", url: "" }),
      el({ url: "" })
    );
    expect(r.compliance).toBe("A");
  });

  it("scenario 8: no image nor iframe", () => {
    const r = evEls();
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucune image ni iframe hors de l'écran initial chargée immédiatement");
  });

  it("scenario 9: top edge at 790 with a viewport of 800 is above the fold", () => {
    expect(evEls(el({ top: 790 })).compliance).toBe("A");
    expect(evEls(el({ top: 799 })).compliance).toBe("A");
    expect(evEls(el({ top: 800 })).compliance).toBe("B");
  });

  it("sorts by distance from the top, then URL", () => {
    const r = evEls(
      el({ url: "https://x.test/c.jpg", top: 3000 }),
      el({ url: "https://x.test/b.jpg", top: 900 }),
      el({ url: "https://x.test/a.jpg", top: 900 })
    );
    expect(r.offenders!.map((l) => l.split(" ")[0])).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("caps at 20 lines with aligned lineRefs", () => {
    const elements = Array.from({ length: 22 }, (_, i) => el({ url: `https://x.test/${i}.jpg`, top: 1000 + i }));
    const r = evEls(...elements);
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 2 autres");
    expect(r.lineRefs).toHaveLength(21);
  });

  it("without page data: no grade", () => {
    const r = ev(undefined);
    expect(r.compliance).toBeUndefined();
    expect(r.detail).toBe("La page n'a pas pu être inspectée");
  });
});

describe("useLazyLoadingRule.collect", () => {
  const collect = () => rule.collect!();
  const stub = (node: Element | Window, props: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(props)) {
      Object.defineProperty(node, k, { value: v, configurable: true });
    }
  };
  const rect = (node: Element, top: number, width = 100, height = 100) =>
    stub(node, {
      getBoundingClientRect: () => ({ top, left: 0, width, height, right: width, bottom: top + height }),
    });
  const byId = (id: string) => document.getElementById(id)!;

  beforeEach(() => {
    document.body.innerHTML = "";
    stub(window, { innerHeight: 800, scrollY: 0 });
  });

  it("returns the viewport height and img/iframe only", () => {
    document.body.innerHTML = `<img src="/a.jpg"><iframe src="https://e.test/f"></iframe><video src="/v.mp4"></video>`;
    const page = collect();
    expect(page.viewportHeight).toBe(800);
    expect(page.elements.map((e) => e.kind)).toEqual(["img", "iframe"]);
  });

  it("scenario 5: top is in document coordinates, independent of scroll", () => {
    document.body.innerHTML = `<img id="a" src="/a.jpg">`;
    rect(byId("a"), 1499.6 - 1000);
    stub(window, { scrollY: 1000 });
    expect(collect().elements[0].top).toBe(1500);
  });

  it("reads loading, rendered and data URI", () => {
    document.body.innerHTML = `
      <img id="a" src="/a.jpg" loading="lazy">
      <img id="b" src="/b.jpg">
      <img id="c" src="data:image/gif;base64,R0lGOD">`;
    rect(byId("a"), 10);
    rect(byId("b"), 10, 0, 0);
    rect(byId("c"), 10);
    const [a, b, c] = collect().elements;
    expect(a).toMatchObject({ loading: "lazy", rendered: true, dataUri: false });
    expect(b.rendered).toBe(false);
    expect(c.dataUri).toBe(true);
  });

  it("scenario 6: detects script lazy loading", () => {
    document.body.innerHTML = `
      <img id="a" data-src="/a.jpg">
      <img id="b" data-srcset="/b.jpg 1x" src="">
      <img id="c" data-src="/c.jpg" src="data:image/gif;base64,R0lGOD">
      <img id="d" data-src="/d.jpg" src="/placeholder.jpg">
      <img id="e" data-src="/e.jpg" src="/e-low.jpg">
      <img id="f" src="/f.jpg">`;
    stub(byId("d"), { complete: true, naturalWidth: 0 });
    stub(byId("e"), { complete: true, naturalWidth: 40 });
    expect(collect().elements.map((e) => e.scriptLazy)).toEqual([true, true, true, true, false, false]);
  });

  it("flags tracking pixels", () => {
    document.body.innerHTML = `<img id="a" src="/a.gif"><img id="b" src="/b.gif" width="1" height="1"><img id="c" src="/c.gif">`;
    stub(byId("a"), { complete: true, naturalWidth: 1, naturalHeight: 1 });
    expect(collect().elements.map((e) => e.trackingPixel)).toEqual([true, true, false]);
  });

  it("iframe URL is its src", () => {
    document.body.innerHTML = `<iframe src="https://e.test/f"></iframe>`;
    expect(collect().elements[0].url).toBe("https://e.test/f");
  });

  it("is self-contained and JSON-serialisable", () => {
    document.body.innerHTML = `<img src="/a.jpg"><iframe src="https://e.test/f"></iframe>`;
    const rebuilt = new Function(`return (${rule.collect!.toString()})`)();
    expect(() => rebuilt()).not.toThrow();
    const out = rebuilt();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("useLazyLoadingRule preview refs (EPIC-PV)", () => {
  it("img lines carry an image preview with the display box", () => {
    const r = evEls(el({ url: "https://x.test/p.jpg", width: 320, height: 240 }));
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image", display: { width: 320, height: 240 } });
  });

  it("img lines without a known size carry an image preview without display", () => {
    const r = evEls(el({ url: "https://x.test/p.jpg" }));
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image" });
    expect(r.lineRefs![0]!.preview).not.toHaveProperty("display");
  });

  it("iframe lines carry the top position", () => {
    const r = evEls(el({ kind: "iframe", url: "https://x.test/embed", top: 2100 }));
    expect(r.lineRefs![0]).toEqual({
      url: "https://x.test/embed",
      prefix: "Iframe ",
      preview: { kind: "iframe", top: 2100 },
    });
  });
});

describe("useLazyLoadingRule.collect sizes (EPIC-PV)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("collects the rounded width and height from the single rect read", () => {
    document.body.innerHTML = `<img id="a" src="/a.jpg"><iframe id="b" src="https://e.test/f"></iframe>`;
    const spies = ["a", "b"].map((id, k) => {
      const spy = vi.fn(() => ({ top: 10, left: 0, width: 300.4 + k, height: 199.6, right: 0, bottom: 0 }));
      Object.defineProperty(document.getElementById(id)!, "getBoundingClientRect", { value: spy, configurable: true });
      return spy;
    });
    const [a, b] = rule.collect!().elements;
    expect(a).toMatchObject({ width: 300, height: 200 });
    expect(b).toMatchObject({ width: 301, height: 200 });
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
  });
});

describe("useLazyLoadingRule performance", () => {
  it("collects and evaluates 2 000 elements within budget", () => {
    document.body.innerHTML = Array.from({ length: 2000 }, (_, i) => `<img src="/i${i}.jpg">`).join("");
    const run = () =>
      rule.evaluate({ url: "", requests: [], page: rule.collect!(), estimates: UNAVAILABLE_ESTIMATES });
    // jsdom has no layout: every box is 0 x 0, so make them rendered.
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return { top: 1000, left: 0, width: 10, height: 10, right: 10, bottom: 1010 } as DOMRect;
    };
    try {
      run();
      // Best of 10 to absorb scheduling noise when the whole suite runs in parallel.
      let ms = Infinity;
      let r = run();
      for (let k = 0; k < 10; k++) {
        const t0 = performance.now();
        r = run();
        ms = Math.min(ms, performance.now() - t0);
      }
      expect(r.compliance).toBe("C");
      expect(ms).toBeLessThan(50);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});

describe("useLazyLoadingRule indicator (US-029 scenario 10)", () => {
  it("never sets an indicator, in any branch", () => {
    const results = [
      ev(undefined),
      evEls(),
      evEls(el({ top: 1200, loading: "lazy" })),
      evEls(el({ top: 1200 })),
      evEls(...Array.from({ length: 30 }, (_, i) => el({ url: `https://x.test/${i}.jpg`, top: 1200 + i }))),
    ];
    expect(results.map((r) => r.compliance)).toEqual([undefined, "A", "A", "B", "C"]);
    for (const r of results) expect(r.indicator).toBeUndefined();
  });
});
