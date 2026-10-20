import { describe, expect, it } from "vitest";
import { request } from "../best-practices/testing/image-fixtures";
import { planCombinedEstimations } from "../image-estimation/image-gain";
import { BestPractice } from "../models/best-practice";
import {
  EncodingSpec,
  ImageFinding,
  OPTIMISED_FORMATS_RULE_ID,
  RESIZE_IMAGES_RULE_ID,
  estimationKey,
} from "../models/image-estimation";
import {
  comparisonSubjectFor,
  hasImageChanged,
  referenceOriginalBytes,
} from "./comparison-subject";
import { ComparisonSubject } from "../models/image-variants";

const URL_A = "https://x.test/photo.jpg";
const AVIF: EncodingSpec = { format: "avif", quality: 65, speed: 6 };
const WEBP_LOSSLESS: EncodingSpec = { format: "webp", lossless: true };

const resizeFinding = (o: Partial<ImageFinding> = {}): ImageFinding => ({
  url: URL_A,
  originalBytes: 240_000,
  state: "estimated",
  estimatedBytes: 60_000,
  gainBytes: 180_000,
  offender: true,
  declaredType: "image/jpeg",
  sourceFormat: "jpeg",
  target: { width: 600, height: 400 },
  natural: { width: 1200, height: 800 },
  display: { width: 300, height: 200 },
  sourceBytes: 240_000,
  ...o,
});
const formatFinding = (o: Partial<ImageFinding> = {}): ImageFinding => ({
  url: URL_A,
  originalBytes: 240_000,
  state: "estimated",
  estimatedBytes: 96_000,
  gainBytes: 144_000,
  offender: true,
  declaredType: "image/jpeg",
  sourceFormat: "jpeg",
  encoding: AVIF,
  natural: { width: 1200, height: 800 },
  display: { width: 300, height: 200 },
  sourceBytes: 240_000,
  ...o,
});
const bp = (id: string, images: ImageFinding[]): BestPractice => ({
  id,
  name: id,
  category: "images",
  detail: "",
  images,
});
const resizeBp = (...f: ImageFinding[]) => bp(RESIZE_IMAGES_RULE_ID, f);
const formatBp = (...f: ImageFinding[]) => bp(OPTIMISED_FORMATS_RULE_ID, f);

describe("comparisonSubjectFor: single offender", () => {
  it("S1: resize list gives Originale / Redimensionnée with the resize job", () => {
    const s = comparisonSubjectFor([resizeBp(resizeFinding())], RESIZE_IMAGES_RULE_ID, URL_A)!;
    expect(s.versions.map((v) => [v.id, v.label])).toEqual([
      ["original", "Originale"],
      ["resized", "Redimensionnée"],
    ]);
    expect(s.versions[0].job).toBeUndefined();
    expect(s.versions[1]).toMatchObject({
      job: {
        url: URL_A,
        declaredType: "image/jpeg",
        transform: { kind: "resize", width: 600, height: 400 },
      },
      estimatedBytes: 60_000,
    });
    expect(s).toMatchObject({
      url: URL_A,
      declaredType: "image/jpeg",
      ruleId: RESIZE_IMAGES_RULE_ID,
      recordedBytes: 240_000,
      recordedSourceBytes: 240_000,
      natural: { width: 1200, height: 800 },
      display: { width: 300, height: 200 },
    });
  });

  it("S2: format list gives Originale / AVIF for a JPEG", () => {
    const s = comparisonSubjectFor([formatBp(formatFinding())], OPTIMISED_FORMATS_RULE_ID, URL_A)!;
    expect(s.versions.map((v) => [v.id, v.label])).toEqual([
      ["original", "Originale"],
      ["converted", "AVIF"],
    ]);
    expect(s.versions[1]).toMatchObject({
      job: { url: URL_A, declaredType: "image/jpeg", transform: { kind: "convert" } },
      estimatedBytes: 96_000,
    });
  });

  it("S2: a PNG offers WebP sans perte", () => {
    const f = formatFinding({ encoding: WEBP_LOSSLESS, declaredType: "image/png" });
    const s = comparisonSubjectFor([formatBp(f)], OPTIMISED_FORMATS_RULE_ID, URL_A)!;
    expect(s.versions[1].label).toBe("WebP sans perte");
    expect(s.declaredType).toBe("image/png");
  });

  it("matches the URL ignoring the fragment", () => {
    const s = comparisonSubjectFor([formatBp(formatFinding())], OPTIMISED_FORMATS_RULE_ID, `${URL_A}#x`);
    expect(s).toBeDefined();
  });

  it("uses the format finding's box and natural size when only that rule flags the image", () => {
    const f = formatFinding({ display: { width: 0, height: 0 }, natural: { width: 10, height: 20 } });
    const s = comparisonSubjectFor([formatBp(f)], OPTIMISED_FORMATS_RULE_ID, URL_A)!;
    expect(s.display).toEqual({ width: 0, height: 0 });
    expect(s.natural).toEqual({ width: 10, height: 20 });
  });

  it("leaves display and natural undefined for legacy findings", () => {
    const f = formatFinding({ display: undefined, natural: undefined, sourceBytes: undefined });
    const s = comparisonSubjectFor([formatBp(f)], OPTIMISED_FORMATS_RULE_ID, URL_A)!;
    expect(s.display).toBeUndefined();
    expect(s.natural).toBeUndefined();
    expect(s.recordedSourceBytes).toBeUndefined();
  });
});

describe("comparisonSubjectFor: double offender", () => {
  const practices = [resizeBp(resizeFinding()), formatBp(formatFinding())];

  it.each([RESIZE_IMAGES_RULE_ID, OPTIMISED_FORMATS_RULE_ID])(
    "S3, S4: opened from %s offers the four versions",
    (ruleId) => {
      const s = comparisonSubjectFor(practices, ruleId, URL_A)!;
      expect(s.versions.map((v) => [v.id, v.label])).toEqual([
        ["original", "Originale"],
        ["resized", "Redimensionnée"],
        ["converted", "AVIF"],
        ["both", "Les deux"],
      ]);
      expect(s.ruleId).toBe(ruleId);
      expect(s.versions[3].estimatedBytes).toBeUndefined();
    }
  );

  it("S4: the 'both' job has the key of planCombinedEstimations", () => {
    const requests = [request(URL_A, { transferSize: 240_000 })];
    const planned = planCombinedEstimations({
      requests,
      bestPractices: practices,
      estimates: () => undefined,
    });
    expect(planned).toHaveLength(1);
    const both = comparisonSubjectFor(practices, RESIZE_IMAGES_RULE_ID, URL_A)!.versions[3];
    expect(both.job).toEqual(planned[0]);
    expect(estimationKey(both.job!)).toBe(estimationKey(planned[0]));
  });

  it("falls back to the format finding's declared type when the resize one is empty", () => {
    const p = [resizeBp(resizeFinding({ declaredType: "" })), formatBp(formatFinding())];
    const both = comparisonSubjectFor(p, RESIZE_IMAGES_RULE_ID, URL_A)!.versions[3];
    expect(both.job!.declaredType).toBe("image/jpeg");
  });

  it("takes recorded figures from the clicked rule and the resize display box first", () => {
    const p = [
      resizeBp(resizeFinding({ originalBytes: 250_000, display: { width: 300, height: 200 } })),
      formatBp(formatFinding({ originalBytes: 240_000, display: { width: 0, height: 0 } })),
    ];
    expect(comparisonSubjectFor(p, OPTIMISED_FORMATS_RULE_ID, URL_A)).toMatchObject({
      recordedBytes: 240_000,
      display: { width: 300, height: 200 },
    });
    expect(comparisonSubjectFor(p, RESIZE_IMAGES_RULE_ID, URL_A)!.recordedBytes).toBe(250_000);
  });

  it("offers no 'both' when the resize finding has no target", () => {
    const p = [resizeBp(resizeFinding({ target: undefined })), formatBp(formatFinding())];
    const s = comparisonSubjectFor(p, OPTIMISED_FORMATS_RULE_ID, URL_A)!;
    expect(s.versions.map((v) => v.id)).not.toContain("both");
  });

  it("offers only the offender rule's variant when the other rule does not flag the image", () => {
    const p = [resizeBp(resizeFinding()), formatBp(formatFinding({ offender: false, gainBytes: 2_000 }))];
    const s = comparisonSubjectFor(p, RESIZE_IMAGES_RULE_ID, URL_A)!;
    expect(s.versions.map((v) => v.id)).toEqual(["original", "resized"]);
    expect(comparisonSubjectFor(p, OPTIMISED_FORMATS_RULE_ID, URL_A)).toBeUndefined();
  });
});

describe("comparisonSubjectFor: S12 non-offenders", () => {
  const cases: Array<[string, Partial<ImageFinding>]> = [
    ["pending", { state: "pending", offender: false, estimatedBytes: undefined, gainBytes: undefined }],
    ["failed", { state: "failed", reason: "timeout", offender: false }],
    ["under the noise threshold", { offender: false, gainBytes: 4_000 }],
    ["skipped", { state: "skipped", reason: "too-large", offender: false }],
  ];
  it.each(cases)("%s gives undefined", (_, o) => {
    expect(comparisonSubjectFor([resizeBp(resizeFinding(o))], RESIZE_IMAGES_RULE_ID, URL_A)).toBeUndefined();
    expect(comparisonSubjectFor([formatBp(formatFinding(o))], OPTIMISED_FORMATS_RULE_ID, URL_A)).toBeUndefined();
  });

  it("gives undefined for an unknown URL, rule or an absent rule", () => {
    const p = [resizeBp(resizeFinding())];
    expect(comparisonSubjectFor(p, RESIZE_IMAGES_RULE_ID, "https://x.test/other.jpg")).toBeUndefined();
    expect(comparisonSubjectFor(p, "Other", URL_A)).toBeUndefined();
    expect(comparisonSubjectFor(p, OPTIMISED_FORMATS_RULE_ID, URL_A)).toBeUndefined();
    expect(comparisonSubjectFor([], RESIZE_IMAGES_RULE_ID, URL_A)).toBeUndefined();
    expect(comparisonSubjectFor([{ ...resizeBp(), images: undefined }], RESIZE_IMAGES_RULE_ID, URL_A)).toBeUndefined();
  });
});

describe("comparisonSubjectFor: cost", () => {
  it("builds the subject of 300 offenders of a page whose two rules list 300 findings in under 50 ms", () => {
    const urls = Array.from({ length: 300 }, (_, i) => `https://x.test/img-${i}.jpg`);
    const practices = [
      resizeBp(...urls.map((url) => resizeFinding({ url }))),
      formatBp(...urls.map((url) => formatFinding({ url }))),
    ];
    const buildAll = () =>
      urls.map((url) => comparisonSubjectFor(practices, RESIZE_IMAGES_RULE_ID, url));
    buildAll(); // warm-up, to avoid cold-JIT flakiness
    const start = performance.now();
    const subjects = buildAll();
    const elapsed = performance.now() - start;
    expect(subjects.every((s) => s !== undefined && s.versions.length === 4)).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("S11: hasImageChanged and referenceOriginalBytes", () => {
  const subject = (o: Partial<ComparisonSubject>): ComparisonSubject => ({
    url: URL_A,
    declaredType: "image/jpeg",
    ruleId: RESIZE_IMAGES_RULE_ID,
    recordedBytes: 240_000,
    recordedSourceBytes: 240_000,
    versions: [{ id: "original", label: "Originale" }],
    ...o,
  });

  it("with sourceBytes, any difference is a change", () => {
    expect(hasImageChanged(subject({}), 180_000)).toBe(true);
    expect(hasImageChanged(subject({}), 240_001)).toBe(true);
    expect(hasImageChanged(subject({}), 240_000)).toBe(false);
  });

  it("with sourceBytes, the reference is the recorded weight unless changed", () => {
    // transfer size (headers included) differs from the body length: still the figure of the line
    const s = subject({ recordedBytes: 240_300, recordedSourceBytes: 240_000 });
    expect(referenceOriginalBytes(s, 240_000)).toBe(240_300);
    expect(referenceOriginalBytes(s, 180_000)).toBe(180_000);
  });

  it("legacy finding: tolerance of max(2 000 bytes, 2 %) around the recorded weight", () => {
    const s = subject({ recordedSourceBytes: undefined, recordedBytes: 240_300 });
    expect(hasImageChanged(s, 240_000)).toBe(false);
    expect(hasImageChanged(s, 180_000)).toBe(true);
    expect(referenceOriginalBytes(s, 240_000)).toBe(240_300);
    expect(referenceOriginalBytes(s, 180_000)).toBe(180_000);
    // 2 % of 240 300 = 4 806 > 2 000
    expect(hasImageChanged(s, 240_300 - 4_806)).toBe(false);
    expect(hasImageChanged(s, 240_300 - 4_807)).toBe(true);
    expect(hasImageChanged(s, 240_300 + 4_807)).toBe(true);
  });

  it("legacy finding: small images use the 2 000 bytes tolerance", () => {
    const s = subject({ recordedSourceBytes: undefined, recordedBytes: 20_000 });
    expect(hasImageChanged(s, 18_000)).toBe(false);
    expect(hasImageChanged(s, 17_999)).toBe(true);
  });

  it("an unknown recorded weight (0) never counts as changed and gives the current bytes", () => {
    const s = subject({ recordedSourceBytes: undefined, recordedBytes: 0 });
    expect(hasImageChanged(s, 180_000)).toBe(false);
    expect(referenceOriginalBytes(s, 180_000)).toBe(180_000);
    const withSource = subject({ recordedBytes: 0, recordedSourceBytes: 240_000 });
    expect(referenceOriginalBytes(withSource, 240_000)).toBe(240_000);
  });
});
