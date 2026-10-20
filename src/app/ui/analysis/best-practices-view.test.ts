import { describe, expect, it } from "vitest";
import {
  aggregateBestPractices,
  describeProgress,
  groupByCategory,
  worstCompliance,
} from "./best-practices-view";
import { PageAnalysis } from "../../domain/models/page-analysis";
import { BestPractice } from "../../domain/models/best-practice";
import { ImageFinding } from "../../domain/models/image-estimation";
import { fileLabel, summariseImageFindings } from "../../domain/best-practices/rules/image-rule-helpers";
import { displayImageName } from "./image-name";
import { comparisonSubjectFor } from "../../domain/image-comparison/comparison-subject";

const page = (title: string, bps: BestPractice[]) =>
  ({ title, bestPractices: bps } as unknown as PageAnalysis);

describe("worstCompliance", () => {
  it("picks the worst defined grade and never lets undefined win", () => {
    expect(worstCompliance("A", "C")).toBe("C");
    expect(worstCompliance("C", "B")).toBe("C");
    expect(worstCompliance(undefined, "A")).toBe("A");
    expect(worstCompliance("B", undefined)).toBe("B");
    expect(worstCompliance(undefined, undefined)).toBeUndefined();
  });
});

describe("aggregateBestPractices", () => {
  it("aggregates across pages with the worst defined grade and merged offenders", () => {
    const base = { id: "r", name: "R", category: "images" as const };
    const result = aggregateBestPractices([
      page("P1", [{ ...base, compliance: "A", detail: "ok" }]),
      page("P2", [{ ...base, compliance: undefined, detail: "?", error: "x" }]),
      page("P3", [{ ...base, compliance: "C", detail: "bad", offenders: ["u1"] }]),
      page("P4", [{ ...base, compliance: "B", detail: "meh", offenders: ["u1", "u2"] }]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].compliance).toBe("C");
    expect(result[0].detail).toBe("bad");
    expect(result[0].offenders).toEqual(["u1", "u2"]);
    expect(result[0].pages).toEqual(["P2", "P3", "P4"]);
  });

  it("keeps compliance undefined when no page could evaluate the rule", () => {
    const base = { id: "r", name: "R", category: "css" as const, detail: "?" };
    const result = aggregateBestPractices([page("P1", [base]), page("P2", [base])]);
    expect(result[0].compliance).toBeUndefined();
  });
});

describe("groupByCategory", () => {
  it("groups in a stable order and skips empty categories", () => {
    const mk = (id: string, category: any) => ({
      id, name: id, category, detail: "", pages: [], offenders: [], lines: [],
    });
    const groups = groupByCategory([mk("a", "js"), mk("b", "content"), mk("c", "js")]);
    expect(groups.map((g) => g.category)).toEqual(["content", "js"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("estimation progress aggregation", () => {
  const base = { id: "r", name: "R", category: "images" as const, detail: "d" };

  it("sums progress across pages and drops the grade while estimating", () => {
    const result = aggregateBestPractices([
      page("P1", [{ ...base, compliance: "C", offenders: ["u1"] }]),
      page("P2", [{ ...base, compliance: undefined, progress: { done: 2, total: 5 } }]),
      page("P3", [{ ...base, compliance: undefined, progress: { done: 1, total: 3 } }]),
    ]);
    expect(result[0].progress).toEqual({ done: 3, total: 8 });
    expect(result[0].compliance).toBeUndefined();
  });

  it("has no progress when no page is estimating", () => {
    const result = aggregateBestPractices([page("P1", [{ ...base, compliance: "B" }])]);
    expect(result[0].progress).toBeUndefined();
    expect(result[0].compliance).toBe("B");
  });

  it("describes the progress in French", () => {
    expect(describeProgress({ done: 2, total: 5 })).toBe("Estimation en cours… (2/5 images)");
  });
});

describe("image lines (US-004)", () => {
  const resizeId = "DontResizeImagesInBrowser";
  const formatId = "UseOptimizedImageFormats";
  const finding = (url: string, gainBytes = 50_000): ImageFinding => ({
    url,
    originalBytes: 100_000,
    state: "estimated",
    estimatedBytes: 100_000 - gainBytes,
    gainBytes,
    offender: true,
    declaredType: "image/jpeg",
  });
  const imageBp = (id: string, images: ImageFinding[], offenders: string[]): BestPractice => ({
    id,
    name: id,
    category: "images",
    compliance: "C",
    detail: "d",
    offenders,
    images,
  });
  const longUrl = "https://cdn.example.org/img/962c01_upload-1-c02rkcjxsn76-frame-1-22.jpeg";

  it("builds image lines from the findings for both image rules", () => {
    const f = finding(longUrl);
    const line = `${fileLabel(f.url)} : 1200×800 pour un affichage en 300×200, gain estimé 50 ko`;
    for (const id of [resizeId, formatId]) {
      const [entry] = aggregateBestPractices([page("P1", [imageBp(id, [f], [line])])]);
      expect(entry.offenders).toEqual([line]);
      expect(entry.lines).toEqual([
        {
          kind: "image",
          text: line,
          ruleId: id,
          url: f.url,
          name: displayImageName(f.url),
          rest: "1200×800 pour un affichage en 300×200, gain estimé 50 ko",
          finding: f,
          comparison: comparisonSubjectFor([imageBp(id, [f], [line])], id, f.url),
        },
      ]);
    }
    expect(displayImageName(longUrl).short).toBe("962c01_uploa...6-frame-1-22.jpeg");
  });

  it("builds lines for strings produced by summariseImageFindings, in order", () => {
    const a = finding("https://x.org/a.jpg", 20_000);
    const b = finding("https://x.org/b.jpg", 80_000);
    const failed: ImageFinding = {
      url: "https://x.org/c.png",
      originalBytes: 0,
      state: "failed",
      reason: "decode-failed",
      offender: false,
      declaredType: "image/png",
    };
    const result = summariseImageFindings([a, b, failed], {
      detailPrefix: "",
      extraEvaluatedBytes: 0,
      offenderPhrase: (n) => `${n}`,
      noOffenderDetail: "",
      offenderLine: (f) => `${fileLabel(f.url)} : gain ${f.gainBytes}`,
    });
    const bp: BestPractice = { id: resizeId, name: "r", category: "images", ...result };
    const [entry] = aggregateBestPractices([page("P1", [bp])]);
    expect(entry.lines.map((l) => l.kind)).toEqual(["image", "image", "image"]);
    expect(entry.lines.map((l) => (l.kind === "image" ? l.url : ""))).toEqual([
      b.url,
      a.url,
      failed.url,
    ]);
    const last = entry.lines[2];
    expect(last.kind === "image" && last.rest).toBe("non évaluée (échec du décodage)");
  });

  it("keeps text lines identical to the offenders without images (legacy)", () => {
    const base = { id: resizeId, name: "R", category: "images" as const, detail: "d" };
    const [entry] = aggregateBestPractices([
      page("P1", [{ ...base, compliance: "C", offenders: ["old.jpg : 10×10", "other"] }]),
    ]);
    expect(entry.lines).toEqual(entry.offenders.map((text) => ({ kind: "text", text })));
  });

  it("keeps the other rules as text lines", () => {
    const [entry] = aggregateBestPractices([
      page("P1", [{ id: "x", name: "X", category: "js", detail: "", compliance: "C", offenders: ["u1"] }]),
    ]);
    expect(entry.lines).toEqual([{ kind: "text", text: "u1" }]);
  });

  it("keeps the overflow line as text", () => {
    const f = finding("https://x.org/a.jpg");
    const line = `${fileLabel(f.url)} : gain`;
    const [entry] = aggregateBestPractices([
      page("P1", [imageBp(resizeId, [f], [line, "… et 3 autres images"])]),
    ]);
    expect(entry.lines.map((l) => l.kind)).toEqual(["image", "text"]);
    expect(entry.lines[1]).toEqual({ kind: "text", text: "… et 3 autres images" });
  });

  it("falls back to text on a prefix mismatch", () => {
    const f = finding("https://x.org/a.jpg");
    const [entry] = aggregateBestPractices([
      page("P1", [imageBp(resizeId, [f], ["b.jpg : gain", "a.jpg: no space"])]),
    ]);
    expect(entry.lines).toEqual([
      { kind: "text", text: "b.jpg : gain" },
      { kind: "text", text: "a.jpg: no space" },
    ]);
  });

  it("dedupes lines across pages like offenders", () => {
    const f = finding("https://x.org/a.jpg");
    const g = finding("https://x.org/b.jpg");
    const la = `a.jpg : gain`;
    const lb = `b.jpg : gain`;
    const [entry] = aggregateBestPractices([
      page("P1", [imageBp(resizeId, [f], [la])]),
      page("P2", [imageBp(resizeId, [f, g], [la, lb])]),
    ]);
    expect(entry.offenders).toEqual([la, lb]);
    expect(entry.lines.map((l) => l.text)).toEqual([la, lb]);
    expect(entry.lines.map((l) => l.kind)).toEqual(["image", "image"]);
  });

  it("builds 300 lines quickly", () => {
    const findings = Array.from({ length: 300 }, (_, i) =>
      finding(`https://x.org/image-number-${String(i).padStart(4, "0")}-with-a-long-name.jpg`, 1_000_000 - i)
    );
    const lines = findings.map((f) => `${fileLabel(f.url)} : gain`);
    const start = performance.now();
    const [entry] = aggregateBestPractices([page("P1", [imageBp(resizeId, findings, lines)])]);
    expect(performance.now() - start).toBeLessThan(50);
    expect(entry.lines).toHaveLength(300);
    expect(entry.lines.every((l) => l.kind === "image")).toBe(true);
  });

  it("S12: offender image lines carry a comparison subject, other lines do not", () => {
    const offender = finding("https://x.org/a.jpg", 80_000);
    const notEvaluated: ImageFinding = {
      url: "https://x.org/c.png",
      originalBytes: 0,
      state: "failed",
      reason: "decode-failed",
      offender: false,
      declaredType: "image/png",
    };
    const lines = [`a.jpg : gain`, `c.png : non évaluée (échec du décodage)`, "… et 3 autres images"];
    const [entry] = aggregateBestPractices([
      page("P1", [imageBp(resizeId, [offender, notEvaluated], lines)]),
    ]);
    const [first, second, third] = entry.lines;
    expect(first.kind === "image" && first.comparison?.url).toBe(offender.url);
    expect(first.kind === "image" && first.comparison?.ruleId).toBe(resizeId);
    expect(second.kind === "image" && second.comparison).toBeUndefined();
    expect(third.kind).toBe("text");
    expect("comparison" in third).toBe(false);
  });

  it("uses the findings of the page the line comes from", () => {
    const f = finding("https://x.org/a.jpg", 80_000);
    const line = `a.jpg : gain`;
    const other = finding("https://x.org/a.jpg", 80_000);
    other.originalBytes = 555_000;
    const [entry] = aggregateBestPractices([
      page("P1", [imageBp(resizeId, [f], [line])]),
      page("P2", [imageBp(resizeId, [other], [line])]),
    ]);
    const l = entry.lines[0];
    expect(l.kind === "image" && l.comparison?.recordedBytes).toBe(100_000);
  });
});
