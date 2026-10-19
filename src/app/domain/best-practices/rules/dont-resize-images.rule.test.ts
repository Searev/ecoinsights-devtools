// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { EstimateLookup, EstimateState, EstimationJob } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { estimated, lookupOf, request } from "../testing/image-fixtures";
import { gradeByShare } from "./image-rule-helpers";
import { dontResizeImagesRule, ResizePageData } from "./dont-resize-images.rule";

const PHOTO = "https://x.test/img/photo.jpg";

type Img = ResizePageData["images"][number];
const img = (o: Partial<Img> = {}): Img => ({
  src: PHOTO,
  displayWidth: 300,
  displayHeight: 200,
  naturalWidth: 1200,
  naturalHeight: 800,
  ...o,
});
const pageOf = (images: Img[], devicePixelRatio = 2): ResizePageData => ({
  devicePixelRatio,
  images,
});
const resizeJob = (url: string, width: number, height: number): EstimationJob => ({
  url,
  declaredType: "image/jpeg",
  transform: { kind: "resize", width, height },
});
const ctx = (
  page: ResizePageData | undefined,
  requests: NetworkRequest[] = [],
  estimates: EstimateLookup = () => undefined
) => ({ url: "https://x.test", requests, page, estimates });
const ev = (page: ResizePageData | undefined, requests: NetworkRequest[] = [], e?: EstimateLookup) =>
  dontResizeImagesRule.evaluate(ctx(page, requests, e));
const plan = (page: ResizePageData | undefined, requests: NetworkRequest[] = []) =>
  dontResizeImagesRule.estimations!({ url: "https://x.test", requests, page });
const done = (src: number, enc: number): EstimateState => estimated(src, enc);

describe("dontResizeImagesRule metadata", () => {
  it("keeps its id, name and category", () => {
    expect(dontResizeImagesRule.id).toBe("DontResizeImagesInBrowser");
    expect(dontResizeImagesRule.name).toBe("Ne pas redimensionner les images dans le navigateur");
    expect(dontResizeImagesRule.category).toBe("images");
  });
});

describe("US-001 S1: oversized image on a 2x screen", () => {
  const requests = [request(PHOTO, { transferSize: 240_000, responseSize: 240_000 })];
  const page = pageOf([img()]);
  const estimates = lookupOf([[resizeJob(PHOTO, 600, 400), done(240_000, 60_000)]]);

  it("plans one resize job to the required size", () => {
    expect(plan(page, requests)).toEqual([resizeJob(PHOTO, 600, 400)]);
  });

  it("reports the offender, the finding and the density", () => {
    const r = ev(page, requests, estimates);
    expect(r.compliance).toBe("C");
    expect(r.progress).toBeUndefined();
    expect(r.images).toHaveLength(1);
    expect(r.images![0]).toMatchObject({
      url: PHOTO,
      state: "estimated",
      originalBytes: 240_000,
      estimatedBytes: 60_000,
      gainBytes: 180_000,
      offender: true,
      target: { width: 600, height: 400 },
      declaredType: "image/jpeg",
    });
    expect(r.offenders).toEqual([
      "photo.jpg : 1200×800 pour un affichage en 300×200 (×2 → 600×400), gain estimé 180 ko",
    ]);
    expect(r.detail).toBe(
      "Densité d'écran : 2x\n1 image(s) surdimensionnée(s), gain estimé 180 ko (75 % du poids des images)"
    );
  });
});

describe("oversize rule", () => {
  it("S2: a 600x400 image shown at 300x200 on a 2x screen needs no job and is not listed", () => {
    const p = pageOf([img({ naturalWidth: 600, naturalHeight: 400 })]);
    expect(plan(p)).toEqual([]);
    const r = ev(p);
    expect(r.images).toEqual([]);
    expect(r.offenders).toBeUndefined();
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Densité d'écran : 2x\nAucune image surdimensionnée");
  });

  it("S3: on a 1x screen the same image is oversized (gain 40 kB)", () => {
    const requests = [request(PHOTO, { transferSize: 100_000 })];
    const p = pageOf([img({ naturalWidth: 600, naturalHeight: 400 })], 1);
    expect(plan(p, requests)).toEqual([resizeJob(PHOTO, 300, 200)]);
    const r = ev(p, requests, lookupOf([[resizeJob(PHOTO, 300, 200), done(100_000, 60_000)]]));
    expect(r.images![0].offender).toBe(true);
    expect(r.images![0].gainBytes).toBe(40_000);
  });

  it("S6: natural size at or below the required size is not listed (upscaled or exact)", () => {
    const p = pageOf([
      img({ src: "https://x.test/a.jpg", naturalWidth: 600, naturalHeight: 400 }),
      img({ src: "https://x.test/b.jpg", naturalWidth: 100, naturalHeight: 50 }),
    ]);
    expect(plan(p)).toEqual([]);
  });

  it("is not oversized when one axis needs the full natural size (the largest ratio governs)", () => {
    // required 600x400: f = max(600/600, 400/800) = 1
    expect(plan(pageOf([img({ naturalWidth: 600, naturalHeight: 800 })]))).toEqual([]);
    // f = max(600/1200, 400/400) = 1
    expect(plan(pageOf([img({ naturalWidth: 1200, naturalHeight: 400 })]))).toEqual([]);
  });

  it("rounds the required size up for fractional densities and display boxes", () => {
    const p = pageOf([img({ displayWidth: 100.4, displayHeight: 50.2, naturalWidth: 400, naturalHeight: 200 })], 1.5);
    // required 151x76, f = max(151/400, 76/200) = 0.38 → 152x76
    expect(plan(p)).toEqual([{ ...resizeJob(PHOTO, 152, 76), declaredType: "" }]);
  });

  it("falls back to a DPR of 1 when the density is missing", () => {
    const p = { devicePixelRatio: 0, images: [img()] } as ResizePageData;
    expect(plan(p)[0].transform).toEqual({ kind: "resize", width: 300, height: 200 });
  });
});

describe("US-001 S4: grade by share of the evaluated weight", () => {
  // 1 000 kB evaluated = the oversized image itself (original 1 000 kB).
  it.each([
    [50_000, "A"],
    [100_000, "B"],
    [300_000, "B"],
    [301_000, "C"],
  ])("gain %s kB gives %s", (gain, grade) => {
    const requests = [request(PHOTO, { transferSize: 1_000_000 })];
    const p = pageOf([img()]);
    const r = ev(p, requests, lookupOf([[resizeJob(PHOTO, 600, 400), done(1_000_000, 1_000_000 - gain)]]));
    expect(r.compliance).toBe(grade);
    expect(gradeByShare(gain, 1_000_000)).toBe(grade);
  });

  it("counts correctly sized images in the evaluated weight", () => {
    const small = "https://x.test/small.jpg";
    const requests = [
      request(PHOTO, { transferSize: 100_000 }),
      request(small, { transferSize: 900_000 }),
    ];
    const p = pageOf([img(), img({ src: small, naturalWidth: 600, naturalHeight: 400 })]);
    const r = ev(p, requests, lookupOf([[resizeJob(PHOTO, 600, 400), done(100_000, 20_000)]]));
    // gain 80 kB over 1 000 kB: A
    expect(r.compliance).toBe("A");
    expect(r.detail).toContain("(8 % du poids des images)");
  });
});

describe("US-001 S5: noise threshold", () => {
  it("does not list nor count a gain of 8 kB", () => {
    const requests = [request(PHOTO, { transferSize: 50_000 })];
    const r = ev(pageOf([img()]), requests, lookupOf([[resizeJob(PHOTO, 600, 400), done(50_000, 42_000)]]));
    expect(r.images![0]).toMatchObject({ gainBytes: 8_000, offender: false });
    expect(r.offenders).toBeUndefined();
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Densité d'écran : 2x\nAucune image surdimensionnée");
  });
});

describe("US-001 S7: out-of-scope images", () => {
  const cases: [string, Img, NetworkRequest[]][] = [
    ["svg by MIME", img({ src: "https://x.test/a" }), [request("https://x.test/a", { type: "image/svg+xml" })]],
    ["svg by path", img({ src: "https://x.test/logo.svg" }), []],
    ["svg data URI", img({ src: "data:image/svg+xml;base64,AAAA" }), []],
    ["data URI", img({ src: "data:image/png;base64,AAAA" }), []],
    ["gif by MIME", img({ src: "https://x.test/a" }), [request("https://x.test/a", { type: "image/gif" })]],
    ["gif by path", img({ src: "https://x.test/a.gif" }), []],
    ["empty source", img({ src: "" }), []],
    ["natural width 0", img({ naturalWidth: 0 }), []],
    ["natural height 0", img({ naturalHeight: 0 }), []],
    ["display 0x0", img({ displayWidth: 0, displayHeight: 0 }), []],
    ["display width 0", img({ displayWidth: 0 }), []],
    ["not an image MIME", img({ src: "https://x.test/a" }), [request("https://x.test/a", { type: "text/html" })]],
  ];
  it.each(cases)("%s: no job, not counted in the evaluated weight", (_, image, requests) => {
    const reqs = [...requests, request("https://x.test/other.jpg", { transferSize: 100_000 })];
    expect(plan(pageOf([image]), reqs)).toEqual([]);
    const r = ev(pageOf([image, img({ src: "https://x.test/other.jpg", naturalWidth: 600, naturalHeight: 400 })]), reqs);
    expect(r.images).toEqual([]);
    expect(r.detail).toBe("Densité d'écran : 2x\nAucune image surdimensionnée");
  });

  it("weighs only in-scope images", () => {
    const svg = request("https://x.test/a.svg", { type: "image/svg+xml", transferSize: 900_000 });
    const jpg = request(PHOTO, { transferSize: 100_000 });
    const r = ev(
      pageOf([img({ src: "https://x.test/a.svg" }), img()]),
      [svg, jpg],
      lookupOf([[resizeJob(PHOTO, 600, 400), done(100_000, 50_000)]])
    );
    // 50 kB over 100 kB (the svg is ignored): C
    expect(r.compliance).toBe("C");
  });

  it("keeps findings skipped as unsupported-format, animated or not-an-image out of the lines and the weight", () => {
    const requests = [request(PHOTO, { transferSize: 100_000 })];
    for (const reason of ["unsupported-format", "animated", "not-an-image"] as const) {
      const r = ev(pageOf([img()]), requests, lookupOf([[resizeJob(PHOTO, 600, 400), { status: "skipped", reason }]]));
      expect(r.images).toHaveLength(1);
      expect(r.images![0].reason).toBe(reason);
      expect(r.offenders).toBeUndefined();
      expect(r.compliance).toBe("A");
    }
  });
});

describe("US-001 S8: pending estimations", () => {
  const urls = [1, 2, 3, 4, 5].map((i) => `https://x.test/p${i}.jpg`);
  const requests = urls.map((u) => request(u, { transferSize: 100_000 }));
  const page = pageOf(urls.map((src) => img({ src })));

  it("reports progress, no compliance and the in-progress detail", () => {
    const e = lookupOf([
      [resizeJob(urls[0], 600, 400), done(100_000, 20_000)],
      [resizeJob(urls[1], 600, 400), done(100_000, 20_000)],
    ]);
    const r = ev(page, requests, e);
    expect(r.compliance).toBeUndefined();
    expect(r.progress).toEqual({ done: 2, total: 5 });
    expect(r.detail).toBe("Densité d'écran : 2x\nEstimation en cours… (2/5 images)");
    expect(r.images).toHaveLength(5);
    expect(r.images!.filter((i) => i.state === "pending")).toHaveLength(3);
  });

  it("treats a job never requested like a pending one", () => {
    const r = ev(page, requests);
    expect(r.progress).toEqual({ done: 0, total: 5 });
  });
});

describe("US-001 S9: too-large images", () => {
  it("skips a 30 MP image without a job and grades the others", () => {
    const big = "https://x.test/big.jpg";
    const requests = [request(big, { transferSize: 5_000_000 }), request(PHOTO, { transferSize: 200_000 })];
    const p = pageOf([img({ src: big, naturalWidth: 6000, naturalHeight: 5000 }), img()]);
    expect(plan(p, requests)).toEqual([resizeJob(PHOTO, 600, 400)]);
    const r = ev(p, requests, lookupOf([[resizeJob(PHOTO, 600, 400), done(200_000, 100_000)]]));
    const bigFinding = r.images!.find((i) => i.url === big)!;
    expect(bigFinding).toMatchObject({ state: "skipped", reason: "too-large", offender: false });
    expect(r.offenders).toContain("big.jpg : non évaluée (image trop volumineuse)");
    expect(r.compliance).toBe("C");
    expect(r.detail).toContain("(50 % du poids des images)");
  });

  it("skips an image heavier than 10 MB", () => {
    const requests = [request(PHOTO, { transferSize: 10_000_001 })];
    expect(plan(pageOf([img()]), requests)).toEqual([]);
    const r = ev(pageOf([img()]), requests);
    expect(r.images![0]).toMatchObject({ state: "skipped", reason: "too-large" });
  });
});

describe("US-001 S10: failures", () => {
  const a = "https://x.test/a.jpg";
  const b = "https://x.test/broken.jpg";
  const requests = [request(a, { transferSize: 200_000 }), request(b, { transferSize: 50_000 })];
  const page = pageOf([img({ src: a }), img({ src: b })]);

  it("lists a failed image as not evaluated and grades the others", () => {
    const r = ev(
      page,
      requests,
      lookupOf([
        [resizeJob(a, 600, 400), done(200_000, 100_000)],
        [resizeJob(b, 600, 400), { status: "failed", reason: "encode-failed" }],
      ])
    );
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([
      "a.jpg : 1200×800 pour un affichage en 300×200 (×2 → 600×400), gain estimé 100 ko",
      "broken.jpg : non évaluée (échec de l'encodage)",
    ]);
  });

  it("is not evaluated when no image could be estimated", () => {
    const r = ev(
      page,
      requests,
      lookupOf([
        [resizeJob(a, 600, 400), { status: "failed", reason: "bytes-unavailable" }],
        [resizeJob(b, 600, 400), { status: "failed", reason: "timeout" }],
      ])
    );
    expect(r.compliance).toBeUndefined();
    expect(r.progress).toBeUndefined();
    expect("error" in r).toBe(false);
    expect(r.detail).toBe("Densité d'écran : 2x\nNon évaluée : aucune image n'a pu être estimée");
  });

  it("is not evaluated with the default unavailable estimator lookup", () => {
    const unavailable: EstimateLookup = () => ({ status: "failed", reason: "estimator-unavailable" });
    const r = ev(page, requests, unavailable);
    expect(r.compliance).toBeUndefined();
  });
});

describe("same URL used several times", () => {
  it("plans one job with the largest display box", () => {
    const requests = [request(PHOTO, { transferSize: 240_000 })];
    const p = pageOf([
      img({ displayWidth: 100, displayHeight: 50 }),
      img({ displayWidth: 300, displayHeight: 200 }),
      img({ src: `${PHOTO}#frag`, displayWidth: 200, displayHeight: 100 }),
    ]);
    expect(plan(p, requests)).toEqual([resizeJob(PHOTO, 600, 400)]);
    expect(ev(p, requests).images).toHaveLength(1);
  });

  it("does not list the image when its largest box is not oversized", () => {
    const p = pageOf([
      img({ displayWidth: 100, displayHeight: 50 }),
      img({ displayWidth: 600, displayHeight: 400 }),
    ]);
    expect(plan(p)).toEqual([]);
  });
});

describe("US-001 S12: analysis stopped", () => {
  it("shows stopped findings as not evaluated and grades the estimated ones", () => {
    const a = "https://x.test/a.jpg";
    const b = "https://x.test/b.jpg";
    const requests = [request(a, { transferSize: 200_000 }), request(b, { transferSize: 80_000 })];
    const r = ev(
      pageOf([img({ src: a }), img({ src: b })]),
      requests,
      lookupOf([
        [resizeJob(a, 600, 400), done(200_000, 100_000)],
        [resizeJob(b, 600, 400), { status: "skipped", reason: "analysis-stopped" }],
      ])
    );
    expect(r.progress).toBeUndefined();
    expect(r.compliance).toBe("C");
    expect(r.offenders).toContain("b.jpg : non évaluée (analyse arrêtée)");
  });
});

describe("US-001 S13: density display", () => {
  it.each([
    [2, "2x"],
    [1, "1x"],
    [1.5, "1.5x"],
    [1.25, "1.25x"],
    [1.3333333, "1.33x"],
    [1.100001, "1.1x"],
  ])("density %s is displayed %s", (dpr, text) => {
    const r = ev(pageOf([], dpr));
    expect(r.detail).toBe(`Densité d'écran : ${text}\nAucune image surdimensionnée`);
  });

  it("uses the fractional density for the required size and the line", () => {
    const requests = [request(PHOTO, { transferSize: 240_000 })];
    const p = pageOf([img()], 1.5);
    expect(plan(p, requests)).toEqual([resizeJob(PHOTO, 450, 300)]);
    const r = ev(p, requests, lookupOf([[resizeJob(PHOTO, 450, 300), done(240_000, 100_000)]]));
    expect(r.offenders![0]).toContain("(×1.5 → 450×300)");
  });
});

describe("offender lines", () => {
  it("sorts by gain and caps at 20 lines then counts the others", () => {
    const urls = Array.from({ length: 23 }, (_, i) => `https://x.test/i${String(i).padStart(2, "0")}.jpg`);
    const requests = urls.map((u) => request(u, { transferSize: 500_000 }));
    const p = pageOf(urls.map((src) => img({ src })));
    const entries: [EstimationJob, EstimateState][] = urls.map((u, i) => [
      resizeJob(u, 600, 400),
      done(500_000, 500_000 - (20_000 + i * 1_000)),
    ]);
    const r = ev(p, requests, lookupOf(entries));
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![0]).toContain("i22.jpg");
    expect(r.offenders![0]).toContain("gain estimé 42 ko");
    expect(r.offenders![20]).toBe("… et 3 autres images");
  });
});

describe("page not inspected", () => {
  it("does not penalise and plans nothing", () => {
    const r = ev(undefined);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("La page n'a pas pu être inspectée");
    expect(plan(undefined)).toEqual([]);
  });
});

describe("dontResizeImagesRule.collect", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reads currentSrc, the bounding box, the natural size and the device pixel ratio", () => {
    document.body.innerHTML = `<img src="https://x.test/a.jpg"><img src="https://x.test/b.png">`;
    const [a, b] = Array.from(document.querySelectorAll("img"));
    Object.defineProperty(a, "currentSrc", { value: "https://x.test/a-2x.jpg" });
    a.getBoundingClientRect = () => ({ width: 300.5, height: 200.25 }) as DOMRect;
    Object.defineProperty(a, "naturalWidth", { value: 1200 });
    Object.defineProperty(a, "naturalHeight", { value: 800 });
    Object.defineProperty(b, "currentSrc", { value: "" });
    b.getBoundingClientRect = () => ({ width: 10, height: 20 }) as DOMRect;
    const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { value: 1.5, configurable: true });
    try {
      const res = dontResizeImagesRule.collect!();
      expect(res.devicePixelRatio).toBe(1.5);
      expect(res.images).toEqual([
        {
          src: "https://x.test/a-2x.jpg",
          displayWidth: 300.5,
          displayHeight: 200.25,
          naturalWidth: 1200,
          naturalHeight: 800,
        },
        {
          src: "https://x.test/b.png",
          displayWidth: 10,
          displayHeight: 20,
          naturalWidth: 0,
          naturalHeight: 0,
        },
      ]);
    } finally {
      if (original) Object.defineProperty(window, "devicePixelRatio", original);
    }
  });

  it("falls back to a density of 1 and returns no image on an empty page", () => {
    const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { value: 0, configurable: true });
    try {
      expect(dontResizeImagesRule.collect!()).toEqual({ devicePixelRatio: 1, images: [] });
    } finally {
      if (original) Object.defineProperty(window, "devicePixelRatio", original);
    }
  });
});
