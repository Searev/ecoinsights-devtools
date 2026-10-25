import { describe, expect, it } from "vitest";
import {
  aggregateBestPractices,
  describeProgress,
  formatIndicator,
  groupByCategory,
  journeyIndicator,
  worstCompliance,
} from "./best-practices-view";
import { PageAnalysis } from "../../domain/models/page-analysis";
import { BestPractice, BestPracticeIndicator } from "../../domain/models/best-practice";
import { ImageFinding } from "../../domain/models/image-estimation";
import { fileLabel, summariseImageFindings } from "../../domain/best-practices/rules/image-rule-helpers";
import { displayImageName } from "./image-name";
import { formatCount } from "../../domain/best-practices/rules/rule-lines";
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
      id, name: id, category, detail: "", pages: [], pageIndicators: [], offenders: [], lines: [],
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

  describe("text previews (US-020)", () => {
    const url = "https://cdn.test/app.css";
    const offender = `${fileLabel(url)} (CSS, 15 ko) : non minifié (~22 % d'octets superflus)`;
    const skipped = `${fileLabel(url)} (CSS, 15 ko) : non évalué (contenu non disponible)`;

    it("gives a text subject with type, declared type and charset from the requests", () => {
      const line = first("MinifyTextFiles", offender, { url, preview: { kind: "text", type: "CSS" } }, [
        req(url, { type: "text/css", responseHeaders: { "content-type": "text/css; charset=ISO-8859-1" } }),
      ]);
      expect(line).toMatchObject({
        kind: "file",
        preview: { kind: "text", url, ruleId: "MinifyTextFiles", fileType: "CSS", declaredType: "text/css", charset: "iso-8859-1" },
      });
    });

    it("S12: a legacy offender ref (without preview) is previewable", () => {
      const line = first("MinifyTextFiles", offender, { url }, [req(url, { type: "text/css" })]);
      expect(line).toMatchObject({ preview: { kind: "text", fileType: "CSS", url } });
    });

    it("S4: a legacy not-evaluated line is not previewable", () => {
      const line = first("MinifyTextFiles", skipped, { url });
      expect(line).toMatchObject({ kind: "file" });
      expect(line).not.toHaveProperty("preview");
    });

    it("a data: URL is not previewable", () => {
      const data = "data:text/css,a%7B%7D";
      const text = `${fileLabel(data)} (CSS, 15 ko) : non minifié (~22 % d'octets superflus)`;
      const line = first("MinifyTextFiles", text, { url: data, preview: { kind: "text", type: "CSS" } });
      expect(line).not.toHaveProperty("preview");
    });
  });

  it("US-019 S9: a saved LimitGifs practice is displayed as stored", () => {
    const url = "https://x.org/pixel.gif";
    const stored = {
      id: "LimitGifs",
      name: "Limiter l'utilisation des GIFs animés",
      category: "images",
      compliance: "C",
      detail: "2 fichiers GIF : old detail",
      offenders: ["anim.gif : 900 ko", `${fileLabel(url)} : 0 ko`],
      lineRefs: [{ url: "https://x.org/anim.gif" }, { url }],
    } as BestPractice;
    const [entry] = aggregateBestPractices([pageWith([stored])]);
    expect(entry.compliance).toBe("C");
    expect(entry.detail).toBe("2 fichiers GIF : old detail");
    expect(entry.offenders).toEqual(["anim.gif : 900 ko", `${fileLabel(url)} : 0 ko`]);
    expect(entry.lines).toHaveLength(2);
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

describe("US-029 indicators", () => {
  const ratio = (offenders: number, expected: number, unit: "uncached-files" | "unminified-files" | "http1-requests" = "uncached-files"): BestPracticeIndicator => ({
    kind: "ratio",
    offenders,
    expected,
    unit,
  });
  const count = (offenders: number, unit: "requests" | "domains" = "requests"): BestPracticeIndicator => ({ kind: "count", offenders, unit });
  const presence = (present: boolean): BestPracticeIndicator => ({ kind: "presence", present, unit: "print-css" });

  const cache = { id: "AddCacheHeaders", name: "Ajouter des entêtes Expires ou Cache-Control", category: "network" as const };
  const requests = { id: "LimitRequests", name: "Limiter le nombre de requêtes HTTP", category: "network" as const };
  const printCss = { id: "PrintStyleSheet", name: "Fournir une print css", category: "css" as const };
  const compress = { id: "CompressTextFiles", name: "Compresser les fichiers textuels", category: "network" as const };
  const minify = { id: "MinifyTextFiles", name: "Minifier les fichiers CSS, JavaScript, HTML et SVG", category: "js" as const };

  const entryOf = (pages: PageAnalysis[]) => aggregateBestPractices(pages)[0];

  describe("formatIndicator", () => {
    it("formats a ratio with the percentage and the unit", () => {
      expect(formatIndicator(ratio(8, 10))).toBe("8 / 10 ressources sans cache (80 %)");
    });

    it("agrees the unit with expected, singular for 0 and 1", () => {
      expect(formatIndicator(ratio(1, 5, "unminified-files"))).toBe("1 / 5 fichiers non minifiés (20 %)");
      expect(formatIndicator(ratio(1, 1, "unminified-files"))).toBe("1 / 1 fichier non minifié (100 %)");
      expect(formatIndicator(ratio(0, 1, "http1-requests"))).toBe("0 / 1 requête HTTP/1 (0 %)");
    });

    it("shows a nothing-to-check message when expected is 0", () => {
      expect(formatIndicator(ratio(0, 0))).toBe("Aucun élément à vérifier");
    });

    it("never rounds a non-zero ratio to 0 % or a partial one to 100 %", () => {
      expect(formatIndicator(ratio(1, 1000))).toBe(`1 / ${formatCount(1000)} ressources sans cache (< 1 %)`);
      expect(formatIndicator(ratio(999, 1000))).toBe(`${formatCount(999)} / ${formatCount(1000)} ressources sans cache (> 99 %)`);
      expect(formatIndicator(ratio(0, 1000))).toContain("(0 %)");
      expect(formatIndicator(ratio(1000, 1000))).toContain("(100 %)");
    });

    it("uses French grouping with a narrow no-break space", () => {
      expect(formatIndicator(count(1500))).toBe(`${formatCount(1500)} requêtes HTTP`);
      expect(formatIndicator(count(1500))).toContain("\u202f");
    });

    it("formats a count, singular for 0 and 1", () => {
      expect(formatIndicator(count(52))).toBe("52 requêtes HTTP");
      expect(formatIndicator(count(1))).toBe("1 requête HTTP");
      expect(formatIndicator(count(0, "domains"))).toBe("0 domaine");
      expect(formatIndicator(count(2, "domains"))).toBe("2 domaines");
    });

    it("formats a presence", () => {
      expect(formatIndicator(presence(true))).toBe("CSS print : oui");
      expect(formatIndicator(presence(false))).toBe("CSS print : non");
    });

    it("labels every unit in singular and plural", () => {
      const counts = ["inline-blocks", "canvas-elements", "css-files", "domains", "gif-files", "requests", "custom-fonts"] as const;
      expect(formatIndicator({ kind: "ratio", offenders: 1, expected: 2, unit: "autoplay-media" })).toBe("1 / 2 médias en lecture ou chargement automatique (50 %)");
      expect(formatIndicator({ kind: "ratio", offenders: 1, expected: 1, unit: "uncompressed-files" })).toBe("1 / 1 fichier non compressé (100 %)");
      expect(formatIndicator({ kind: "ratio", offenders: 1, expected: 2, unit: "resized-images" })).toBe("1 / 2 images redimensionnées (50 %)");
      expect(formatIndicator({ kind: "ratio", offenders: 1, expected: 2, unit: "unoptimised-images" })).toBe("1 / 2 images au format non optimisé (50 %)");
      expect(formatIndicator({ kind: "ratio", offenders: 1, expected: 1, unit: "missing-alternatives" })).toBe("1 / 1 contenu sans alternative textuelle (100 %)");
      expect(formatIndicator({ kind: "ratio", offenders: 1, expected: 2, unit: "missing-alternatives" })).toBe("1 / 2 contenus sans alternative textuelle (50 %)");
      const plurals: Record<(typeof counts)[number], [string, string]> = {
        "inline-blocks": ["bloc CSS ou JavaScript en ligne", "blocs CSS ou JavaScript en ligne"],
        "canvas-elements": ["élément canvas", "éléments canvas"],
        "css-files": ["fichier CSS", "fichiers CSS"],
        domains: ["domaine", "domaines"],
        "gif-files": ["fichier GIF", "fichiers GIF"],
        requests: ["requête HTTP", "requêtes HTTP"],
        "custom-fonts": ["fichier de police personnalisé", "fichiers de police personnalisés"],
      };
      for (const unit of counts) {
        expect(formatIndicator({ kind: "count", offenders: 1, unit })).toBe(`1 ${plurals[unit][0]}`);
        expect(formatIndicator({ kind: "count", offenders: 3, unit })).toBe(`3 ${plurals[unit][1]}`);
      }
    });
  });

  describe("journeyIndicator", () => {
    it("returns undefined for no indicator", () => {
      expect(journeyIndicator([])).toBeUndefined();
    });

    it("sums ratios", () => {
      expect(journeyIndicator([ratio(8, 10), ratio(4, 30)])).toBe("12 / 40 ressources sans cache (30 %)");
    });

    it("keeps the worst count and flags it when several pages", () => {
      expect(journeyIndicator([count(25), count(80), count(41)])).toBe("80 requêtes HTTP (page la plus chargée)");
      expect(journeyIndicator([count(52)])).toBe("52 requêtes HTTP");
    });

    it("summarises presence", () => {
      expect(journeyIndicator([presence(false), presence(false), presence(false), presence(true)])).toBe("CSS print absente sur 3 pages sur 4");
      expect(journeyIndicator([presence(false), presence(true)])).toBe("CSS print absente sur 1 page sur 2");
      expect(journeyIndicator([presence(true), presence(true)])).toBe("CSS print : oui");
      expect(journeyIndicator([presence(false)])).toBe("CSS print : non");
      expect(journeyIndicator([presence(true)])).toBe("CSS print : oui");
    });

    it("keeps only the indicators of the first one's kind and unit", () => {
      expect(journeyIndicator([ratio(1, 2), count(9), ratio(1, 2, "unminified-files"), ratio(1, 2)])).toBe("2 / 4 ressources sans cache (50 %)");
    });
  });

  describe("aggregateBestPractices", () => {
    it("scenario 1: one page, ratio in the header", () => {
      const e = entryOf([page("Accueil", [{ ...cache, compliance: "C", detail: "d", indicator: ratio(8, 10) }])]);
      expect(e.indicator).toBe("8 / 10 ressources sans cache (80 %)");
      expect(e.pageIndicators).toEqual(["8 / 10 ressources sans cache (80 %)"]);
    });

    it("scenario 2: journey sum and per-page indicators", () => {
      const e = entryOf([
        page("Accueil", [{ ...cache, compliance: "C", detail: "d", indicator: ratio(8, 10) }]),
        page("Liste", [{ ...cache, compliance: "B", detail: "d", indicator: ratio(4, 30) }]),
      ]);
      expect(e.indicator).toBe("12 / 40 ressources sans cache (30 %)");
      expect(e.pages).toEqual(["Accueil", "Liste"]);
      expect(e.pageIndicators).toEqual(["8 / 10 ressources sans cache (80 %)", "4 / 30 ressources sans cache (13 %)"]);
    });

    it("keeps pageIndicators parallel to pages when a compliant page is skipped", () => {
      const e = entryOf([
        page("Ok", [{ ...cache, compliance: "A", detail: "d", indicator: ratio(0, 5) }]),
        page("Bad", [{ ...cache, compliance: "C", detail: "d", indicator: ratio(5, 5) }]),
      ]);
      expect(e.pages).toEqual(["Bad"]);
      expect(e.pageIndicators).toEqual(["5 / 5 ressources sans cache (100 %)"]);
      expect(e.indicator).toBe("5 / 10 ressources sans cache (50 %)");
    });

    it("scenario 3: worst page for a count, none suffix on one page", () => {
      const mk = (n: number, title: string) => page(title, [{ ...requests, compliance: "C", detail: "d", indicator: count(n) }]);
      expect(entryOf([mk(25, "a"), mk(80, "b"), mk(41, "c")]).indicator).toBe("80 requêtes HTTP (page la plus chargée)");
      expect(entryOf([mk(52, "a")]).indicator).toBe("52 requêtes HTTP");
    });

    it("scenario 4: presence over 4 pages", () => {
      const mk = (present: boolean, title: string) =>
        page(title, [{ ...printCss, compliance: present ? "A" : "C", detail: "d", indicator: presence(present) }]);
      const e = entryOf([mk(false, "p1"), mk(false, "p2"), mk(false, "p3"), mk(true, "p4")]);
      expect(e.indicator).toBe("CSS print absente sur 3 pages sur 4");
      expect(e.pages).toEqual(["p1", "p2", "p3"]);
      expect(e.pageIndicators).toEqual(["CSS print : non", "CSS print : non", "CSS print : non"]);
    });

    it("scenario 5: nothing to check", () => {
      const e = entryOf([page("Accueil", [{ ...compress, compliance: "A", detail: "d", indicator: ratio(0, 0) }])]);
      expect(e.indicator).toBe("Aucun élément à vérifier");
    });

    it("scenario 6: pending rule shows no indicator at all", () => {
      const e = entryOf([
        page("p1", [{ ...minify, compliance: "C", detail: "d", indicator: ratio(1, 5) }]),
        page("p2", [{ ...minify, detail: "d", progress: { done: 2, total: 5, unit: "files" } }]),
      ]);
      expect(e.progress).toBeDefined();
      expect(e).not.toHaveProperty("indicator");
      expect(e.pageIndicators.every((p) => p === undefined)).toBe(true);
      expect(e.pageIndicators).toHaveLength(e.pages.length);
    });

    it("scenario 6: a Non évaluée page is excluded from the sum", () => {
      const e = entryOf([
        page("p1", [{ ...cache, compliance: "C", detail: "d", indicator: ratio(8, 10) }]),
        page("p2", [{ ...cache, detail: "Non évaluée" }]),
      ]);
      expect(e.indicator).toBe("8 / 10 ressources sans cache (80 %)");
      expect(e.pages).toEqual(["p1", "p2"]);
      expect(e.pageIndicators).toEqual(["8 / 10 ressources sans cache (80 %)", undefined]);
    });

    it("ignores a stray indicator on an ungraded page", () => {
      const e = entryOf([page("p1", [{ ...cache, detail: "?", indicator: ratio(1, 2) }])]);
      expect(e).not.toHaveProperty("indicator");
      expect(e.pageIndicators).toEqual([undefined]);
    });

    it("scenario 7: declared and analysed files are counted, non-evaluated excluded", () => {
      const e = entryOf([page("p", [{ ...minify, compliance: "C", detail: "d", indicator: ratio(1, 5, "unminified-files") }])]);
      expect(e.indicator).toBe("1 / 5 fichiers non minifiés (20 %)");
    });

    it("scenario 9: legacy pages have no indicator and nothing else changes", () => {
      const e = entryOf([page("p", [{ ...cache, compliance: "C", detail: "d", offenders: ["u"] }])]);
      expect(e).not.toHaveProperty("indicator");
      expect(e.pageIndicators).toEqual([undefined]);
      expect(e.pages).toEqual(["p"]);
      expect(e.offenders).toEqual(["u"]);
      expect(e.detail).toBe("d");
      expect(e.compliance).toBe("C");
    });

    it("ignores legacy pages when mixed with new ones", () => {
      const e = entryOf([
        page("old", [{ ...cache, compliance: "C", detail: "d" }]),
        page("new", [{ ...cache, compliance: "C", detail: "d", indicator: ratio(2, 4) }]),
      ]);
      expect(e.indicator).toBe("2 / 4 ressources sans cache (50 %)");
      expect(e.pageIndicators).toEqual([undefined, "2 / 4 ressources sans cache (50 %)"]);
    });
  });

  describe("NFR", () => {
    it("aggregates 50 pages x 17 rules under 5 ms (best of 10)", () => {
      const pages = Array.from({ length: 50 }, (_, p) =>
        page(
          `P${p}`,
          Array.from({ length: 17 }, (_, r) => ({
            id: `Rule${r}`,
            name: `Rule ${r}`,
            category: "network" as const,
            compliance: "C" as const,
            detail: "d",
            indicator: r % 2 === 0 ? ratio(p % 7, 10 + p) : count(p + r),
          }))
        )
      );
      let best = Infinity;
      for (let i = 0; i < 10; i++) {
        const t = performance.now();
        aggregateBestPractices(pages);
        best = Math.min(best, performance.now() - t);
      }
      console.info(`NFR aggregateBestPractices 50x17 best of 10: ${best.toFixed(3)} ms`);
      expect(best).toBeLessThan(5);
      const inds = Array.from({ length: 50 }, (_, i) => ratio(i % 7, 10 + i));
      let bestJourney = Infinity;
      for (let i = 0; i < 10; i++) {
        const t = performance.now();
        journeyIndicator(inds);
        bestJourney = Math.min(bestJourney, performance.now() - t);
      }
      console.info(`NFR journeyIndicator 50 best of 10: ${bestJourney.toFixed(3)} ms`);
      expect(bestJourney).toBeLessThan(5);
    });
  });
});
