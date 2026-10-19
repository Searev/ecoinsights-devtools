import { describe, expect, it } from "vitest";
import {
  EncodingSpec,
  EstimateLookup,
  EstimateState,
  EstimationJob,
  OPTIMISED_FORMATS_RULE_ID,
} from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { estimated, lookupOf, request } from "../testing/image-fixtures";
import { optimisedFormatsRule } from "./optimised-formats.rule";

const AVIF: EncodingSpec = { format: "avif", quality: 65, speed: 6 };
const WEBP_LOSSLESS: EncodingSpec = { format: "webp", lossless: true };

const convertJob = (url: string, declaredType = "image/jpeg"): EstimationJob => ({
  url,
  declaredType,
  transform: { kind: "convert" },
});
const plan = (requests: NetworkRequest[]) =>
  optimisedFormatsRule.estimations!({ url: "https://x.test", requests, page: undefined });
const ev = (requests: NetworkRequest[], estimates: EstimateLookup = () => undefined) =>
  optimisedFormatsRule.evaluate({ url: "https://x.test", requests, page: undefined, estimates });
const jpegToAvif = (src: number, enc: number): EstimateState =>
  estimated(src, enc, { sourceFormat: "jpeg", target: AVIF });

const PHOTO = "https://x.test/img/photo.jpg";
const LOGO = "https://x.test/logo.png";

describe("optimisedFormatsRule metadata", () => {
  it("has the expected id, name, category and no collector", () => {
    expect(optimisedFormatsRule.id).toBe(OPTIMISED_FORMATS_RULE_ID);
    expect(optimisedFormatsRule.id).toBe("UseOptimizedImageFormats");
    expect(optimisedFormatsRule.name).toBe("Utiliser des formats d'image optimisés");
    expect(optimisedFormatsRule.category).toBe("images");
    expect(optimisedFormatsRule.collect).toBeUndefined();
  });
});

describe("US-002 S1: JPEG to AVIF", () => {
  const requests = [request(PHOTO, { transferSize: 240_000 })];
  const estimates = lookupOf([[convertJob(PHOTO), jpegToAvif(240_000, 96_000)]]);

  it("plans one convert job", () => {
    expect(plan(requests)).toEqual([convertJob(PHOTO)]);
  });

  it("lists the offender with its line, encoding and gain", () => {
    const r = ev(requests, estimates);
    expect(r.offenders).toEqual(["photo.jpg : JPEG 240 ko → AVIF ≈ 96 ko, gain estimé 144 ko"]);
    expect(r.images![0]).toMatchObject({
      url: PHOTO,
      state: "estimated",
      originalBytes: 240_000,
      estimatedBytes: 96_000,
      gainBytes: 144_000,
      offender: true,
      encoding: AVIF,
      sourceFormat: "jpeg",
      declaredType: "image/jpeg",
    });
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("1 image(s) à convertir, gain estimé 144 ko (60 % du poids des images)");
    expect(r.progress).toBeUndefined();
  });
});

describe("US-002 S2: PNG to lossless WebP", () => {
  it("shows the PNG line and the 15 kB gain", () => {
    const requests = [request(LOGO, { type: "image/png", transferSize: 50_000 })];
    const job = convertJob(LOGO, "image/png");
    const r = ev(
      requests,
      lookupOf([[job, estimated(50_000, 35_000, { sourceFormat: "png", target: WEBP_LOSSLESS })]])
    );
    expect(r.offenders).toEqual(["logo.png : PNG 50 ko → WebP sans perte ≈ 35 ko, gain estimé 15 ko"]);
    expect(r.images![0].gainBytes).toBe(15_000);
    expect(r.images![0].encoding).toEqual(WEBP_LOSSLESS);
  });
});

describe("US-002 S3: already optimised", () => {
  it("is A, lists nothing and plans no job when there are only WebP and AVIF images", () => {
    const requests = [
      request("https://x.test/a.webp", { type: "image/webp", transferSize: 30_000 }),
      request("https://x.test/b.avif", { type: "image/avif", transferSize: 20_000 }),
    ];
    expect(plan(requests)).toEqual([]);
    const r = ev(requests);
    expect(r.compliance).toBe("A");
    expect(r.offenders).toBeUndefined();
    expect(r.images).toEqual([]);
    expect(r.detail).toBe("Toutes les images utilisent un format optimisé");
  });

  it("counts already-optimised images in the evaluated weight", () => {
    const requests = [
      request(PHOTO, { transferSize: 100_000 }),
      request("https://x.test/b.webp", { type: "image/webp", transferSize: 400_000 }),
    ];
    const r = ev(requests, lookupOf([[convertJob(PHOTO), jpegToAvif(100_000, 40_000)]]));
    // 60 kB over 500 kB = 12 %
    expect(r.compliance).toBe("B");
    expect(r.detail).toContain("(12 % du poids des images)");
  });

  it("counts a skipped(already-optimised) outcome like a compliant image", () => {
    const requests = [request("https://x.test/x", { type: "", transferSize: 400_000 }), request(PHOTO, { transferSize: 100_000 })];
    const r = ev(
      requests,
      lookupOf([
        [convertJob("https://x.test/x", ""), { status: "skipped", reason: "already-optimised", sourceFormat: "webp" }],
        [convertJob(PHOTO), jpegToAvif(100_000, 40_000)],
      ])
    );
    expect(r.detail).toContain("(12 % du poids des images)");
    expect(r.offenders).toHaveLength(1);
  });
});

describe("US-002 S4: no gain", () => {
  it("does not list a 4 kB PNG that becomes 5 kB", () => {
    const requests = [request(LOGO, { type: "image/png", transferSize: 4_000 })];
    const r = ev(
      requests,
      lookupOf([[convertJob(LOGO, "image/png"), estimated(4_000, 5_000, { sourceFormat: "png", target: WEBP_LOSSLESS })]])
    );
    expect(r.images![0]).toMatchObject({ gainBytes: 0, offender: false });
    expect(r.offenders).toBeUndefined();
    expect(r.compliance).toBe("A");
  });
});

describe("US-002 S5: MIME type wins over the extension", () => {
  it("ignores photo.jpg served as image/webp", () => {
    const requests = [request(PHOTO, { type: "image/webp", transferSize: 100_000 })];
    expect(plan(requests)).toEqual([]);
    expect(ev(requests).images).toEqual([]);
  });
});

describe("US-002 S6: generic MIME type", () => {
  const url = "https://x.test/img/42";
  const requests = [request(url, { type: "application/octet-stream", transferSize: 50_000 })];

  it("plans a convert job for a generic type", () => {
    expect(plan(requests)).toEqual([convertJob(url, "application/octet-stream")]);
    expect(plan([request(url, { type: "", transferSize: 1 })])).toHaveLength(1);
  });

  it("lists the image once the codec found a PNG", () => {
    const r = ev(
      requests,
      lookupOf([[convertJob(url, "application/octet-stream"), estimated(50_000, 35_000, { sourceFormat: "png", target: WEBP_LOSSLESS })]])
    );
    expect(r.offenders).toEqual(["42 : PNG 50 ko → WebP sans perte ≈ 35 ko, gain estimé 15 ko"]);
  });
});

describe("US-002 S7: out-of-scope images", () => {
  it("ignores GIF, ICO, SVG and non-image requests", () => {
    const requests = [
      request("https://x.test/a.gif", { type: "image/gif", transferSize: 90_000 }),
      request("https://x.test/a.ico", { type: "image/x-icon", transferSize: 90_000 }),
      request("https://x.test/a.svg", { type: "image/svg+xml", transferSize: 90_000 }),
      request("https://x.test/a.html", { type: "text/html", transferSize: 90_000 }),
      request("https://x.test/a.png", { type: "image/png", code: 404, transferSize: 90_000 }),
    ];
    expect(plan(requests)).toEqual([]);
    expect(ev(requests).images).toEqual([]);
  });

  it("does not count a generic outcome skipped as animated, unsupported or not-an-image", () => {
    const url = "https://x.test/x";
    for (const reason of ["animated", "unsupported-format", "not-an-image"] as const) {
      const requests = [request(url, { type: "", transferSize: 900_000 }), request(PHOTO, { transferSize: 100_000 })];
      const r = ev(
        requests,
        lookupOf([
          [convertJob(url, ""), { status: "skipped", reason }],
          [convertJob(PHOTO), jpegToAvif(100_000, 50_000)],
        ])
      );
      expect(r.offenders).toHaveLength(1);
      expect(r.detail).toContain("(50 % du poids des images)");
    }
  });
});

describe("US-002 S8: grade by share", () => {
  it.each([
    [40_000, "A"],
    [120_000, "B"],
    [200_000, "C"],
  ])("gain %s on 500 kB gives %s", (gain, grade) => {
    const requests = [request(PHOTO, { transferSize: 500_000 })];
    const r = ev(requests, lookupOf([[convertJob(PHOTO), jpegToAvif(500_000, 500_000 - gain)]]));
    expect(r.compliance).toBe(grade);
  });
});

describe("US-002 S9: failures", () => {
  it("lists a failed image as not evaluated and grades the others", () => {
    const broken = "https://x.test/broken.jpg";
    const requests = [request(PHOTO, { transferSize: 100_000 }), request(broken, { transferSize: 50_000 })];
    const r = ev(
      requests,
      lookupOf([
        [convertJob(PHOTO), jpegToAvif(100_000, 40_000)],
        [convertJob(broken), { status: "failed", reason: "encode-failed" }],
      ])
    );
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([
      "photo.jpg : JPEG 100 ko → AVIF ≈ 40 ko, gain estimé 60 ko",
      "broken.jpg : non évaluée (échec de l'encodage)",
    ]);
  });

  it("is not evaluated when every image failed", () => {
    const r = ev([request(PHOTO, { transferSize: 100_000 })], () => ({ status: "failed", reason: "estimator-unavailable" }));
    expect(r.compliance).toBeUndefined();
    expect("error" in r).toBe(false);
    expect(r.detail).toBe("Non évaluée : aucune image n'a pu être estimée");
  });
});

describe("pending, too-large, stopped, duplicates", () => {
  it("reports progress while estimations are pending", () => {
    const urls = ["a", "b", "c"].map((n) => `https://x.test/${n}.jpg`);
    const requests = urls.map((u) => request(u, { transferSize: 100_000 }));
    const r = ev(requests, lookupOf([[convertJob(urls[0]), jpegToAvif(100_000, 40_000)]]));
    expect(r.compliance).toBeUndefined();
    expect(r.progress).toEqual({ done: 1, total: 3 });
    expect(r.detail).toBe("Estimation en cours… (1/3 images)");
  });

  it("skips an image over 10 MB without a job", () => {
    const requests = [request(PHOTO, { transferSize: 10_000_001 })];
    expect(plan(requests)).toEqual([]);
    const r = ev(requests);
    expect(r.images![0]).toMatchObject({ state: "skipped", reason: "too-large" });
    expect(r.offenders).toEqual(["photo.jpg : non évaluée (image trop volumineuse)"]);
  });

  it("shows a stopped finding as not evaluated", () => {
    const stopped = "https://x.test/s.jpg";
    const requests = [request(PHOTO, { transferSize: 100_000 }), request(stopped, { transferSize: 100_000 })];
    const r = ev(
      requests,
      lookupOf([
        [convertJob(PHOTO), jpegToAvif(100_000, 40_000)],
        [convertJob(stopped), { status: "skipped", reason: "analysis-stopped" }],
      ])
    );
    expect(r.offenders).toContain("s.jpg : non évaluée (analyse arrêtée)");
    expect(r.compliance).toBe("C");
  });

  it("deduplicates by URL (fragment ignored, last request wins)", () => {
    const requests = [
      request(PHOTO, { transferSize: 100_000 }),
      request(`${PHOTO}#x`, { transferSize: 120_000 }),
    ];
    expect(plan(requests)).toEqual([convertJob(PHOTO)]);
    expect(ev(requests).images).toHaveLength(1);
  });

  it("sorts the offenders by gain and caps the lines at 20", () => {
    const urls = Array.from({ length: 22 }, (_, i) => `https://x.test/i${String(i).padStart(2, "0")}.jpg`);
    const requests = urls.map((u) => request(u, { transferSize: 500_000 }));
    const entries: [EstimationJob, EstimateState][] = urls.map((u, i) => [convertJob(u), jpegToAvif(500_000, 500_000 - (20_000 + i * 1_000))]);
    const r = ev(requests, lookupOf(entries));
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![0]).toContain("i21.jpg");
    expect(r.offenders![20]).toBe("… et 2 autres images");
  });

  it("uses the body size of a cached image as its weight", () => {
    const requests = [request(PHOTO, { transferSize: 0, responseSize: 240_000 })];
    const r = ev(requests, lookupOf([[convertJob(PHOTO), jpegToAvif(240_000, 96_000)]]));
    expect(r.images![0].originalBytes).toBe(240_000);
    expect(r.images![0].gainBytes).toBe(144_000);
  });
});
