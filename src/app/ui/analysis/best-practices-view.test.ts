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
  it("ignores lineRefs for a practice with images", () => {
    const f = finding("https://x.org/a.jpg", 80_000);
    const line = "a.jpg : gain";
    const b = { ...imageBp(resizeId, [f], [line]), lineRefs: [{ url: f.url }] } as BestPractice;
    const [entry] = aggregateBestPractices([page("P1", [b])]);
    expect(entry.lines[0].kind).toBe("image");
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

describe("file lines from lineRefs (ARCH-DECISION-017)", () => {
  const bp = (offenders: string[], lineRefs?: (import("../../domain/models/best-practice").LineRef | null)[]): BestPractice =>
    ({ id: "video", name: "V", category: "content", compliance: "C", detail: "d", offenders, lineRefs } as BestPractice);

  it("renders a prefixed file line (video)", () => {
    const url = "https://x.org/media/Vidéo%20intro.mp4";
    const text = `Vidéo ${fileLabel(url)} : ni sous-titres ni libellé`;
    const [entry] = aggregateBestPractices([page("P1", [bp([text], [{ url, prefix: "Vidéo " }])])]);
    expect(entry.lines[0]).toEqual({
      kind: "file",
      text,
      prefix: "Vidéo ",
      ruleId: "video",
      url,
      name: displayImageName(url),
      rest: " : ni sous-titres ni libellé",
    });
  });

  it("renders a suffix-style line without prefix", () => {
    const url = "https://x.org/vendor.js";
    const text = "vendor.js (JS, 250 ko) : non compressé";
    const [entry] = aggregateBestPractices([page("P1", [bp([text], [{ url }])])]);
    expect(entry.lines[0]).toMatchObject({ kind: "file", prefix: "", rest: " (JS, 250 ko) : non compressé" });
  });

  it("falls back to text when the ref does not match the line", () => {
    const text = "other.js : x";
    const [entry] = aggregateBestPractices([page("P1", [bp([text], [{ url: "https://x.org/vendor.js" }])])]);
    expect(entry.lines[0]).toEqual({ kind: "text", text });
  });

  it("keeps null refs and the 'et N autres' line as text", () => {
    const [entry] = aggregateBestPractices([
      page("P1", [bp(["example.org : 3 requêtes", "… et 2 autres"], [null, null])]),
    ]);
    expect(entry.lines.map((l) => l.kind)).toEqual(["text", "text"]);
  });

  it("treats a missing lineRefs entry as text", () => {
    const [entry] = aggregateBestPractices([page("P1", [bp(["a.js : x", "b.js : y"], [{ url: "https://x.org/a.js" }])])]);
    expect(entry.lines.map((l) => l.kind)).toEqual(["file", "text"]);
  });

  it("renders a legacy practice without lineRefs as text", () => {
    const [entry] = aggregateBestPractices([page("P1", [bp(["a.js : x"])])]);
    expect(entry.lines[0]).toEqual({ kind: "text", text: "a.js : x" });
  });

  it("deduplicates file lines across pages by text", () => {
    const url = "https://x.org/a.js";
    const b = bp(["a.js : x"], [{ url }]);
    const [entry] = aggregateBestPractices([page("P1", [b]), page("P2", [b])]);
    expect(entry.lines).toHaveLength(1);
    expect(entry.offenders).toEqual(["a.js : x"]);
  });
});

describe("files progress", () => {
  it("describes files progress", () => {
    expect(describeProgress({ done: 2, total: 5, unit: "files" })).toBe("Analyse en cours… (2/5 fichiers)");
    expect(describeProgress({ done: 2, total: 5, unit: "images" })).toBe("Estimation en cours… (2/5 images)");
  });

  it("keeps the first defined unit when summing", () => {
    const base = { id: "r", name: "R", category: "js" as const, detail: "" };
    const [entry] = aggregateBestPractices([
      page("P1", [{ ...base, compliance: undefined, progress: { done: 1, total: 2 } }]),
      page("P2", [{ ...base, compliance: undefined, progress: { done: 1, total: 3, unit: "files" } }]),
      page("P3", [{ ...base, compliance: undefined, progress: { done: 0, total: 1, unit: "images" } }]),
    ]);
    expect(entry.progress).toEqual({ done: 2, total: 6, unit: "files" });
  });
});

describe("preview subjects of file lines (ARCH-DECISION-020)", () => {
  type Ref = import("../../domain/models/best-practice").LineRef;
  const req = (href: string, extra: Record<string, unknown> = {}) =>
    ({ url: new URL(href), type: "", code: 200, transferSize: 1000, responseSize: 1000, ...extra }) as never;
  const pageWith = (bps: BestPractice[], requests: unknown[] = []) =>
    ({ title: "P", bestPractices: bps, requests }) as unknown as PageAnalysis;
  const bp = (id: string, offenders: string[], lineRefs: (Ref | null)[]): BestPractice =>
    ({ id, name: id, category: "content", compliance: "C", detail: "d", offenders, lineRefs }) as BestPractice;
  const first = (id: string, text: string, ref: Ref, requests: unknown[] = []) => {
    const [entry] = aggregateBestPractices([pageWith([bp(id, [text], [ref])], requests)]);
    return entry.lines[0];
  };

  it("exposes ruleId, url and an image preview (US-006)", () => {
    const url = "https://x.org/hero.jpg";
    const line = first("ProvideTextAlternatives", `${fileLabel(url)} : sans alt`, {
      url,
      preview: { kind: "image", display: { width: 300, height: 200 } },
    }, [req(url, { type: "image/jpeg" })]);
    expect(line).toMatchObject({
      kind: "file",
      ruleId: "ProvideTextAlternatives",
      url,
      preview: { kind: "image", url, declaredType: "image/jpeg", display: { width: 300, height: 200 } },
    });
  });

  it("builds a video media subject", () => {
    const url = "https://x.org/clip.mp4";
    const line = first("ProvideTextAlternatives", `Vidéo ${fileLabel(url)} : x`, {
      url,
      prefix: "Vidéo ",
      preview: { kind: "video" },
    }, [req(url, { type: "video/mp4", transferSize: 500 })]);
    expect(line).toMatchObject({ preview: { kind: "media", media: "video", downloadedBytes: 500, recordedStatus: 200 } });
  });

  it("builds an iframe subject (US-007)", () => {
    const url = "https://www.google.com/maps";
    const line = first("UseLazyLoading", `Iframe ${fileLabel(url)} : x`, {
      url,
      prefix: "Iframe ",
      preview: { kind: "iframe", top: 1200 },
    });
    expect(line).toMatchObject({ preview: { kind: "iframe", host: "www.google.com", top: 1200 } });
  });

  it("builds an audio subject (US-014) and a font subject (US-018)", () => {
    const a = "https://x.org/s.mp3";
    const audio = first("AvoidMediaAutoplay", `Son ${fileLabel(a)} : x`, { url: a, prefix: "Son ", preview: { kind: "audio" } });
    expect(audio).toMatchObject({ preview: { kind: "media", media: "audio" } });
    const f = "https://x.org/f.woff2";
    const font = first("UseStandardFonts", `${fileLabel(f)} : 98 ko`, { url: f, preview: { kind: "font" } });
    expect(font).toMatchObject({ preview: { kind: "font", declaredType: "" } });
  });

  it("gives no preview to an area ref, blob: or data: urls", () => {
    const area = "https://x.org/page";
    expect(first("ProvideTextAlternatives", `${fileLabel(area)} : x`, { url: area })).not.toHaveProperty("preview");
    const blob = "blob:https://x.org/1234";
    expect(first("AvoidMediaAutoplay", `Vidéo ${fileLabel(blob)} : x`, { url: blob, prefix: "Vidéo ", preview: { kind: "video" } }))
      .not.toHaveProperty("preview");
    const data = "data:image/png;base64,AAAA";
    expect(first("ProvideTextAlternatives", `${fileLabel(data)} : x`, { url: data, preview: { kind: "image" } }))
      .not.toHaveProperty("preview");
  });

  it("falls back to the rule for a legacy LimitGifs ref (US-015 S11)", () => {
    const url = "https://x.org/a.gif";
    const line = first("LimitGifs", `${fileLabel(url)} : x`, { url });
    expect(line).toMatchObject({ preview: { kind: "image", url } });
  });

  it("keeps legacy URL-only font lines as plain text (US-018 S8)", () => {
    const legacy = {
      id: "UseStandardFonts",
      name: "Utiliser des polices standards",
      category: "fonts",
      compliance: "C",
      detail: "1 police(s) téléchargée(s) (64 ko)",
      offenders: ["https://fonts.gstatic.com/s/roboto/v30/KFOm.woff2"],
    } as BestPractice;
    const [entry] = aggregateBestPractices([pageWith([legacy])]);
    expect(entry.lines).toEqual([{ kind: "text", text: "https://fonts.gstatic.com/s/roboto/v30/KFOm.woff2" }]);
  });

  it("gives no preview to a font ref with an unknown prefix", () => {
    const url = "https://x.org/f.woff2";
    const line = first("UseStandardFonts", `Autre ${fileLabel(url)} : x`, { url, prefix: "Autre " });
    expect(line).toMatchObject({ kind: "file" });
    expect(line).not.toHaveProperty("preview");
  });

  it("reads the requests once per page", () => {
    const url = "https://x.org/a.gif";
    let reads = 0;
    const requests = new Proxy([req(url), req("https://x.org/b.gif")], {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator) reads++;
        return Reflect.get(target, prop, receiver);
      },
    });
    const text = (u: string) => `${fileLabel(u)} : x`;
    const b = "https://x.org/b.gif";
    aggregateBestPractices([
      pageWith([bp("LimitGifs", [text(url), text(b)], [{ url }, { url: b }])], requests as unknown as unknown[]),
    ]);
    expect(reads).toBe(1);
  });

  it("does not touch the requests when there are no file lines", () => {
    let reads = 0;
    const requests = new Proxy([], {
      get(t, p, r) {
        reads++;
        return Reflect.get(t, p, r);
      },
    });
    aggregateBestPractices([pageWith([bp("x", ["a"], [null])], requests as unknown as unknown[])]);
    expect(reads).toBe(0);
  });
});
