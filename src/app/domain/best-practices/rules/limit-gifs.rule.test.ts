import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { MIN_COUNTED_GIF_BYTES } from "../../image-estimation/policy";
import { formatKo } from "./image-rule-helpers";
import { LimitGifsPage, limitGifsRule } from "./limit-gifs.rule";

const req = (path: string, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(`https://x.test${path}`),
  code: 200,
  type: "",
  responseSize: 0,
  transferSize: 0,
  ...o,
});
const gif = (path: string, transferSize: number, o: Partial<NetworkRequest> = {}) =>
  req(path, { type: "image/gif", transferSize, responseSize: transferSize * 2, ...o });
const ev = (requests: NetworkRequest[], page?: LimitGifsPage) =>
  limitGifsRule.evaluate({ url: "https://x.test", requests, page, estimates: UNAVAILABLE_ESTIMATES });
const img = (url: string, width: number, height: number) => ({ url, width, height });

const SUFFIX = "à remplacer par une vidéo WebM ou MP4 pour les animations, ou un format d'image moderne";

describe("limitGifsRule metadata", () => {
  it("has the expected id, name and category, and a collector", () => {
    expect(limitGifsRule.id).toBe("LimitGifs");
    expect(limitGifsRule.name).toBe("Limiter l'utilisation des GIFs animés");
    expect(limitGifsRule.category).toBe("images");
    expect(typeof limitGifsRule.collect).toBe("function");
  });
});

describe("limitGifsRule.evaluate", () => {
  it("scenario 1: no GIF gives A", () => {
    const r = ev([
      req("/a.jpg", { type: "image/jpeg" }),
      req("/b.png", { type: "image/png" }),
      req("/c.webp", { type: "image/webp" }),
    ]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucun fichier GIF");
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 2: one GIF gives B", () => {
    const r = ev([gif("/loader.gif", 45_000)]);
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([`loader.gif : ${formatKo(45_000)}`]);
    expect(r.lineRefs).toEqual([{ url: "https://x.test/loader.gif", preview: { kind: "image" } }]);
    expect(r.detail).toBe(`1 fichier GIF : ${SUFFIX}`);
  });

  it("scenario 3: more than one GIF gives C, largest first", () => {
    const r = ev([gif("/small.gif", 5_000), gif("/anim.gif", 900_000)]);
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([`anim.gif : ${formatKo(900_000)}`, `small.gif : ${formatKo(5_000)}`]);
    expect(r.detail).toBe(`2 fichiers GIF : ${SUFFIX}`);
  });

  it("scenario 4: the same GIF requested twice counts once", () => {
    const r = ev([gif("/loader.gif", 45_000), gif("/loader.gif#x", 45_000)]);
    expect(r.compliance).toBe("B");
    expect(r.offenders).toHaveLength(1);
  });

  it("scenario 5: detected by extension when MIME is generic, case-insensitive", () => {
    const r = ev([req("/media/banner.GIF", { type: "application/octet-stream", transferSize: 6_000 })]);
    expect(r.compliance).toBe("B");
    expect(ev([req("/x.gif", { type: "", transferSize: 6_000 })]).compliance).toBe("B");
  });

  it("does not use the extension when the MIME type is specific", () => {
    expect(ev([req("/x.gif", { type: "image/png" })]).compliance).toBe("A");
    expect(ev([req("/x", { type: "application/octet-stream" })]).compliance).toBe("A");
  });

  it("scenario 6: failed requests are ignored", () => {
    expect(ev([gif("/missing.gif", 10, { code: 404 })]).compliance).toBe("A");
    expect(ev([gif("/m.gif", 10, { code: 304 })]).compliance).toBe("A");
  });

  it("shows the decoded size when the GIF came from the cache", () => {
    const r = ev([gif("/c.gif", 0, { responseSize: 30_000 })]);
    expect(r.offenders).toEqual([`c.gif : ${formatKo(30_000)}`]);
  });

  it("breaks size ties by URL", () => {
    const r = ev([gif("/b.gif", 5_000), gif("/a.gif", 5_000)]);
    expect(r.offenders!.map((l) => l.split(" ")[0])).toEqual(["a.gif", "b.gif"]);
  });

  it("caps at 20 lines with lineRefs aligned", () => {
    const r = ev(Array.from({ length: 22 }, (_, i) => gif(`/g${String(i).padStart(2, "0")}.gif`, 5_000)));
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 2 autres");
    expect(r.lineRefs).toHaveLength(21);
    expect(r.lineRefs![20]).toBeNull();
    expect(r.detail).toBe(`22 fichiers GIF : ${SUFFIX}`);
  });

  it("evaluates 2 000 requests in under 10 ms", () => {
    const requests = Array.from({ length: 2_000 }, (_, i) =>
      i % 2 ? gif(`/g${i}.gif`, i) : req(`/f${i}.png`, { type: "image/png" })
    );
    ev(requests);
    let best = Infinity;
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      ev(requests);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(10);
  });
});

describe("limitGifsRule.evaluate small GIFs ignored (US-019)", () => {
  const IGNORED = (text: string) => ` (${text})`;

  it("exposes the 5 000 bytes policy", () => {
    expect(MIN_COUNTED_GIF_BYTES).toBe(5_000);
  });

  it("scenario 1: the tracking pixel is ignored", () => {
    const r = ev([gif("/anim.gif", 900_000), gif("/pixel.gif", 43)]);
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([`anim.gif : ${formatKo(900_000)}`]);
    expect(r.lineRefs).toHaveLength(1);
    expect(r.detail).toBe(`1 fichier GIF : ${SUFFIX}${IGNORED("1 GIF de moins de 5 ko ignoré")}`);
  });

  it("scenario 2: only tracking pixels gives A, with no line", () => {
    const r = ev([gif("/p1.gif", 43), gif("/p2.gif", 35)]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucun fichier GIF de 5 ko ou plus (2 GIF de moins de 5 ko ignorés)");
    expect(r.offenders).toBeUndefined();
    expect(r.lineRefs).toBeUndefined();
  });

  it("scenario 4: 5 000 bytes is counted, 4 999 is ignored", () => {
    const r = ev([gif("/edge.gif", 5_000), gif("/below.gif", 4_999)]);
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([`edge.gif : ${formatKo(5_000)}`]);
    expect(r.detail).toContain("(1 GIF de moins de 5 ko ignoré)");
  });

  it("scenario 5: several counted GIFs and no ignored GIF mention nothing", () => {
    const r = ev([gif("/a.gif", 45_000), gif("/b.gif", 12_000)]);
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe(`2 fichiers GIF : ${SUFFIX}`);
  });

  it("scenario 6: the decoded size is used when the transfer size is 0", () => {
    const r = ev([
      gif("/cached.gif", 0, { responseSize: 30_000 }),
      gif("/tiny.gif", 0, { responseSize: 800 }),
    ]);
    expect(r.offenders).toEqual([`cached.gif : ${formatKo(30_000)}`]);
    expect(r.detail).toContain("(1 GIF de moins de 5 ko ignoré)");
  });

  it("scenario 7: an unknown size is ignored", () => {
    const r = ev([gif("/unknown.gif", 0, { responseSize: 0 })]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucun fichier GIF de 5 ko ou plus (1 GIF de moins de 5 ko ignoré)");
  });

  it("scenario 8: duplicates count once and failures are not counted at all", () => {
    const r = ev([
      gif("/pixel.gif", 43),
      gif("/pixel.gif", 43),
      gif("/pixel.gif", 43),
      gif("/missing.gif", 43, { code: 404 }),
    ]);
    expect(r.detail).toBe("Aucun fichier GIF de 5 ko ou plus (1 GIF de moins de 5 ko ignoré)");
  });

  it("uses the plural for three ignored GIFs", () => {
    const r = ev([gif("/a.gif", 1), gif("/b.gif", 2), gif("/c.gif", 3), gif("/big.gif", 9_000)]);
    expect(r.detail).toBe(`1 fichier GIF : ${SUFFIX} (3 GIF de moins de 5 ko ignorés)`);
  });

  it("keeps the display box of counted GIFs only", () => {
    const r = ev([gif("/anim.gif", 9_000), gif("/pixel.gif", 43)], {
      images: [img("https://x.test/anim.gif", 30, 20), img("https://x.test/pixel.gif", 1, 1)],
    });
    expect(r.lineRefs).toEqual([
      { url: "https://x.test/anim.gif", preview: { kind: "image", display: { width: 30, height: 20 } } },
    ]);
  });
});

describe("limitGifsRule.evaluate display boxes (US-015)", () => {
  const A = "https://x.test/anim.gif";

  it("scenario 3: the line carries the box of the img showing the GIF", () => {
    const r = ev([gif("/anim.gif", 900_000)], { images: [img(A, 300, 200)] });
    expect(r.offenders).toEqual([`anim.gif : ${formatKo(900_000)}`]);
    expect(r.lineRefs).toEqual([{ url: A, preview: { kind: "image", display: { width: 300, height: 200 } } }]);
  });

  it("scenario 4: a GIF shown by no img gets a 0 x 0 box", () => {
    const r = ev([gif("/loader.gif", 5_000)], { images: [img("https://x.test/other.png", 10, 10)] });
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image", display: { width: 0, height: 0 } });
  });

  it("an empty collected page also gives 0 x 0", () => {
    const r = ev([gif("/loader.gif", 5_000)], { images: [] });
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image", display: { width: 0, height: 0 } });
  });

  it("collector failed: no display at all", () => {
    const r = ev([gif("/anim.gif", 5_000)], undefined);
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image" });
    expect("display" in r.lineRefs![0]!.preview!).toBe(false);
  });

  it("matches the box ignoring the URL fragment on either side", () => {
    const r = ev([gif("/anim.gif#a", 5_000)], { images: [img(`${A}#b`, 40, 30)] });
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image", display: { width: 40, height: 30 } });
  });

  it("keeps the largest box when several collected entries match", () => {
    const r = ev([gif("/anim.gif", 5_000)], { images: [img(A, 10, 10), img(A, 100, 50), img(A, 20, 20)] });
    expect(r.lineRefs![0]!.preview).toEqual({ kind: "image", display: { width: 100, height: 50 } });
  });

  it("grade, detail and text are unchanged by the page data", () => {
    const requests = [gif("/anim.gif", 900_000), gif("/pixel.gif", 43)];
    const without = ev(requests);
    const withPage = ev(requests, { images: [img(A, 300, 200)] });
    expect(withPage.compliance).toBe(without.compliance);
    expect(withPage.detail).toBe(without.detail);
    expect(withPage.offenders).toEqual(without.offenders);
  });

  it("evaluates 2 000 requests and 2 000 collected images in under 10 ms", () => {
    const requests = Array.from({ length: 2_000 }, (_, i) => gif(`/g${i}.gif`, i + 1));
    const images = Array.from({ length: 2_000 }, (_, i) => img(`https://x.test/g${i}.gif`, 10, 10));
    ev(requests, { images });
    let best = Infinity;
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      ev(requests, { images });
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(10);
  });
});

// The collector runs against a fake document of plain objects, so this file keeps Node's fast `URL`
// (the 10 ms evaluation budgets above would not hold with jsdom's URL polyfill).
describe("limitGifsRule.collect", () => {
  type FakeImg = { src: string; currentSrc?: string; getBoundingClientRect: ReturnType<typeof vi.fn> };
  let nodes: FakeImg[];
  beforeEach(() => {
    nodes = [];
    vi.stubGlobal("document", { querySelectorAll: () => nodes });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const addImg = (src: string, w: number, h: number, currentSrc?: string) => {
    const el: FakeImg = {
      src,
      currentSrc,
      getBoundingClientRect: vi.fn(() => ({ width: w + 0.4, height: h + 0.6 })),
    };
    nodes.push(el);
    return el;
  };
  const collect = () => limitGifsRule.collect!() as LimitGifsPage;

  it("returns rounded boxes keyed by currentSrc, else src", () => {
    addImg("https://x.test/a.gif", 300, 200);
    addImg("https://x.test/fallback.png", 10, 10, "https://x.test/b.gif");
    expect(collect().images).toEqual([
      { url: "https://x.test/a.gif", width: 300, height: 201 },
      { url: "https://x.test/b.gif", width: 10, height: 11 },
    ]);
  });

  it("skips empty and data: URLs", () => {
    addImg("data:image/gif;base64,R0lGOD", 5, 5);
    addImg("", 5, 5);
    expect(collect().images).toEqual([]);
  });

  it("deduplicates by URL keeping the largest area", () => {
    addImg("https://x.test/a.gif", 10, 10);
    addImg("https://x.test/a.gif", 100, 50);
    addImg("https://x.test/a.gif", 20, 20);
    expect(collect().images).toEqual([{ url: "https://x.test/a.gif", width: 100, height: 51 }]);
  });

  it("keeps a 0 x 0 box only when no other box exists for the URL", () => {
    for (const url of ["a.gif", "b.gif"]) {
      addImg(`https://x.test/${url}`, 0, 0).getBoundingClientRect.mockReturnValue({ width: 0, height: 0 });
    }
    addImg("https://x.test/b.gif", 30, 30);
    expect(collect().images).toEqual([
      { url: "https://x.test/a.gif", width: 0, height: 0 },
      { url: "https://x.test/b.gif", width: 30, height: 31 },
    ]);
  });

  it("reads getBoundingClientRect exactly once per img", () => {
    const els = [addImg("https://x.test/a.gif", 1, 1), addImg("https://x.test/a.gif", 2, 2), addImg("https://x.test/b.gif", 3, 3)];
    collect();
    for (const el of els) expect(el.getBoundingClientRect).toHaveBeenCalledTimes(1);
  });

  it("is self-contained and JSON-serialisable", () => {
    addImg("https://x.test/a.gif", 3, 3);
    const rebuilt = new Function(`return (${limitGifsRule.collect!.toString()})()`)();
    expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(rebuilt);
  });
});
