import { describe, expect, it } from "vitest";
import { NetworkRequest } from "../../models/network-request";
import {
  ContentJob,
  ContentLookup,
  ContentState,
  UNAVAILABLE_CONTENTS,
  contentKey,
} from "../../models/text-content";
import { request as baseRequest } from "../testing/image-fixtures";
import { formatKo } from "./image-rule-helpers";
import { minifyTextFilesRule } from "./minify-text-files.rule";

const MIME: Record<string, string> = {
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  html: "text/html",
  svg: "image/svg+xml",
};

function file(name: string, size: number, overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  const ext = name.split(".").pop()!.toLowerCase();
  return baseRequest(`https://cdn.test/${name}`, { type: MIME[ext], responseSize: size, ...overrides });
}

const analysed = (share: number, characters = 100_000): ContentState => ({
  status: "analysed",
  characters,
  removableCharacters: Math.round(characters * share),
});
const unavailable: ContentState = { status: "not-evaluated", reason: "content-unavailable" };
const pending: ContentState = { status: "pending" };

function lookupOf(states: Record<string, ContentState>): ContentLookup {
  const map = new Map(Object.entries(states).map(([name, s]) => [contentKey({ url: `https://cdn.test/${name}`, type: "JS" }), s]));
  return (job) => map.get(contentKey(job));
}

const withChars = (characters: number, removableCharacters: number): ContentState => ({
  status: "analysed",
  characters,
  removableCharacters,
});

function run(requests: NetworkRequest[], states: Record<string, ContentState>) {
  return minifyTextFilesRule.evaluate({
    url: "https://www.example.org/",
    requests,
    page: undefined,
    estimates: () => undefined,
    contents: lookupOf(states),
  });
}

describe("MinifyTextFiles rule", () => {
  it("has the expected metadata", () => {
    expect(minifyTextFilesRule.id).toBe("MinifyTextFiles");
    expect(minifyTextFilesRule.name).toBe("Minifier les fichiers CSS, JavaScript, HTML et SVG");
    expect(minifyTextFilesRule.category).toBe("network");
  });

  it("scenario 1: all minified gives A", () => {
    const res = run(
      [file("app.js", 120_000), file("style.css", 30_000)],
      { "app.js": analysed(0.01), "style.css": analysed(0.02) }
    );
    expect(res.compliance).toBe("A");
    expect(res.detail).toBe("Tous les fichiers CSS, JavaScript, HTML et SVG sont minifiés");
    expect(res.offenders).toBeUndefined();
  });

  it("scenario 2: one unminified file gives B with its line", () => {
    const res = run(
      [file("app.js", 120_000), file("custom.css", 15_000)],
      { "app.js": analysed(0.01), "custom.css": analysed(0.22) }
    );
    expect(res.compliance).toBe("B");
    expect(res.detail).toBe("1 fichier sur 2 non minifié");
    expect(res.offenders).toEqual(["custom.css (CSS, 15 ko) : non minifié (~22 % d'octets superflus)"]);
    expect(res.lineRefs).toEqual([{ url: "https://cdn.test/custom.css", preview: { kind: "text", type: "CSS" } }]);
  });

  it("US-020: offender lines carry a text preview of their type, not-evaluated lines none", () => {
    const res = run(
      [file("a.js", 5_000), file("b.css", 5_000), file("c.html", 5_000), file("d.svg", 5_000), file("e.js", 5_000)],
      { "a.js": analysed(0.3), "b.css": analysed(0.3), "c.html": analysed(0.3), "d.svg": analysed(0.3), "e.js": unavailable }
    );
    const byUrl = new Map(res.lineRefs!.map((ref) => [ref!.url, ref!]));
    expect(byUrl.get("https://cdn.test/a.js")!.preview).toEqual({ kind: "text", type: "JS" });
    expect(byUrl.get("https://cdn.test/b.css")!.preview).toEqual({ kind: "text", type: "CSS" });
    expect(byUrl.get("https://cdn.test/c.html")!.preview).toEqual({ kind: "text", type: "HTML" });
    expect(byUrl.get("https://cdn.test/d.svg")!.preview).toEqual({ kind: "text", type: "SVG" });
    const skipped = byUrl.get("https://cdn.test/e.js")!;
    expect(skipped).toEqual({ url: "https://cdn.test/e.js" });
    expect("preview" in skipped).toBe(false);
  });

  it("scenario 3: nothing minified gives C", () => {
    const res = run(
      [file("a.js", 5_000), file("b.css", 5_000), file("c.html", 5_000)],
      { "a.js": analysed(0.3), "b.css": analysed(0.3), "c.html": analysed(0.3) }
    );
    expect(res.compliance).toBe("C");
    expect(res.detail).toBe("3 fichiers sur 3 non minifiés");
  });

  it("treats exactly 5 % removable as not minified and just under as minified", () => {
    const res = run(
      [file("a.js", 5_000), file("b.js", 5_000)],
      { "a.js": analysed(0.05), "b.js": analysed(0.0499) }
    );
    expect(res.compliance).toBe("B");
    expect(res.offenders).toHaveLength(1);
  });

  it("scenario 6: files without content are excluded from the grade and counted in the detail", () => {
    const res = run(
      [file("a.js", 5_000), file("b.js", 5_000), file("c.js", 5_000), file("d.js", 5_000)],
      { "a.js": analysed(0.01), "b.js": analysed(0.4), "c.js": unavailable, "d.js": unavailable }
    );
    expect(res.compliance).toBe("B");
    expect(res.detail).toBe("1 fichier sur 2 non minifié (2 fichiers non évalués)");
    expect(res.offenders).toEqual([
      "b.js (JS, 5 ko) : non minifié (~40 % d'octets superflus)",
      "c.js (JS, 5 ko) : non évalué (contenu non disponible)",
      "d.js (JS, 5 ko) : non évalué (contenu non disponible)",
    ]);
  });

  it("uses the singular suffix for one file not evaluated, also on an A", () => {
    const res = run(
      [file("a.js", 5_000), file("c.js", 5_000)],
      { "a.js": analysed(0.01), "c.js": unavailable }
    );
    expect(res.compliance).toBe("A");
    expect(res.detail).toBe("Tous les fichiers CSS, JavaScript, HTML et SVG sont minifiés (1 fichier non évalué)");
  });

  it("scenario 7: nothing evaluated gives no grade and no progress", () => {
    const res = run([file("a.js", 5_000), file("b.css", 5_000)], { "a.js": unavailable, "b.css": unavailable });
    expect(res.compliance).toBeUndefined();
    expect(res.progress).toBeUndefined();
    expect(res.detail).toBe("Contenu des fichiers non disponible");
  });

  it("scenario 8: ignores a 700-byte file and counts an 8 MB file as not evaluated, with no job", () => {
    const requests = [file("tiny.css", 700), file("huge.js", 8_000_000)];
    const jobs = minifyTextFilesRule.contentAnalyses!({ url: "u", requests, page: undefined });
    expect(jobs).toEqual([]);
    const res = run(requests, {});
    expect(res.compliance).toBeUndefined();
    expect(res.detail).toBe("Contenu des fichiers non disponible");
    expect(res.offenders).toEqual([`huge.js (JS, ${formatKo(8_000_000)}) : non évalué (fichier trop volumineux)`]);
  });

  it("keeps a file of exactly 1 000 bytes and exactly 5 000 000 bytes within the limits", () => {
    const requests = [file("min.js", 1_000), file("max.js", 5_000_000)];
    const jobs = minifyTextFilesRule.contentAnalyses!({ url: "u", requests, page: undefined });
    expect(jobs.map((j) => j.url)).toEqual(["https://cdn.test/min.js", "https://cdn.test/max.js"]);
  });

  it("scenario 9: pending files give progress and no grade", () => {
    const names = ["a.js", "b.js", "c.js", "d.js", "e.js"];
    const res = run(names.map((n) => file(n, 5_000)), {
      "a.js": analysed(0.01),
      "b.js": analysed(0.5),
      "c.js": pending,
      // d.js and e.js were never requested: treated as pending
    });
    expect(res.compliance).toBeUndefined();
    expect(res.progress).toEqual({ done: 2, total: 5, unit: "files" });
    expect(res.detail).toBe("Analyse en cours… (2/5 fichiers)");
  });

  it("scenario 9: files not evaluated from the start count as done", () => {
    const res = run(
      [file("a.js", 5_000), file("huge.js", 9_000_000), file("c.js", 5_000)],
      { "a.js": pending, "c.js": pending }
    );
    expect(res.progress).toEqual({ done: 1, total: 3, unit: "files" });
  });

  it("scenario 10: files stopped mid-analysis are listed with their reason", () => {
    const res = run(
      [file("a.js", 5_000), file("b.js", 5_000)],
      { "a.js": analysed(0.4), "b.js": { status: "not-evaluated", reason: "analysis-stopped" } }
    );
    expect(res.compliance).toBe("C");
    expect(res.detail).toBe("1 fichier sur 1 non minifié (1 fichier non évalué)");
    expect(res.offenders![1]).toBe("b.js (JS, 5 ko) : non évalué (analyse arrêtée)");
  });

  it("labels every not-evaluated reason", () => {
    const reasons: [ContentState, string][] = [
      [{ status: "not-evaluated", reason: "content-unavailable" }, "contenu non disponible"],
      [{ status: "not-evaluated", reason: "too-large" }, "fichier trop volumineux"],
      [{ status: "not-evaluated", reason: "analysis-stopped" }, "analyse arrêtée"],
      [{ status: "not-evaluated", reason: "analysis-failed" }, "échec de l'analyse"],
      [{ status: "not-evaluated", reason: "analyser-unavailable" }, "analyse indisponible"],
    ];
    for (const [state, label] of reasons) {
      const res = run([file("a.js", 5_000)], { "a.js": state });
      expect(res.offenders).toEqual([`a.js (JS, 5 ko) : non évalué (${label})`]);
    }
  });

  it("evaluates to Non évaluée without a lookup (analyser unavailable)", () => {
    const res = minifyTextFilesRule.evaluate({
      url: "u",
      requests: [file("a.js", 5_000)],
      page: undefined,
      estimates: () => undefined,
      contents: UNAVAILABLE_CONTENTS,
    });
    expect(res.compliance).toBeUndefined();
    expect(res.detail).toBe("Contenu des fichiers non disponible");
  });

  it("gives A when no file is in scope (non-2xx, non-text, tiny)", () => {
    const res = run(
      [
        file("a.js", 5_000, { code: 304 }),
        file("b.js", 5_000, { code: 404 }),
        baseRequest("https://cdn.test/photo.jpg", { responseSize: 50_000 }),
        file("tiny.css", 999),
      ],
      {}
    );
    expect(res.compliance).toBe("A");
    expect(res.detail).toBe("Aucun fichier CSS, JavaScript, HTML ou SVG à vérifier");
  });

  it("detects files by extension when the MIME type is generic", () => {
    const res = run([file("a.js", 5_000, { type: "application/octet-stream" })], { "a.js": analysed(0.5) });
    expect(res.compliance).toBe("C");
  });

  it("counts a URL requested twice once, keeping the last request", () => {
    const jobs = minifyTextFilesRule.contentAnalyses!({
      url: "u",
      requests: [file("a.js", 5_000, { code: 500 }), file("a.js", 5_000), file("a.js", 6_000)],
      page: undefined,
    });
    expect(jobs).toHaveLength(1);
  });

  it("builds jobs with the type and the response charset", () => {
    const jobs: ContentJob[] = minifyTextFilesRule.contentAnalyses!({
      url: "u",
      requests: [
        file("a.js", 5_000),
        file("b.css", 5_000, { responseHeaders: { "content-type": "text/css; charset=ISO-8859-1" } }),
      ],
      page: undefined,
    });
    expect(jobs).toEqual([
      { url: "https://cdn.test/a.js", type: "JS", charset: undefined },
      { url: "https://cdn.test/b.css", type: "CSS", charset: "iso-8859-1" },
    ]);
  });

  it("sorts offenders by superfluous bytes, largest first, then by URL", () => {
    const res = run(
      [file("small.js", 10_000), file("big.js", 100_000), file("b.js", 20_000), file("a.js", 20_000)],
      {
        "small.js": analysed(0.9), // 9 000 bytes
        "big.js": analysed(0.1), // 10 000 bytes
        "b.js": analysed(0.25), // 5 000
        "a.js": analysed(0.25), // 5 000
      }
    );
    expect(res.offenders!.map((l) => l.split(" ")[0])).toEqual(["big.js", "small.js", "a.js", "b.js"]);
  });

  it("caps the lines at 20 then adds '… et N autres'", () => {
    const names = Array.from({ length: 22 }, (_, i) => `f${String(i).padStart(2, "0")}.js`);
    const res = run(
      names.map((n) => file(n, 5_000)),
      Object.fromEntries(names.map((n) => [n, analysed(0.5)]))
    );
    expect(res.offenders).toHaveLength(21);
    expect(res.offenders![20]).toBe("… et 2 autres");
    expect(res.lineRefs![20]).toBeNull();
  });

  describe("declared minified builds (US-021)", () => {
    const declared = [file("jquery.min.js", 90_000), file("Bootstrap.MIN.CSS", 40_000), file("app.min.mjs", 20_000)];

    it("scenarios 1, 2: declared files produce no content job", () => {
      const jobs = minifyTextFilesRule.contentAnalyses!({ url: "u", requests: declared, page: undefined });
      expect(jobs).toEqual([]);
    });

    it("scenario 1: a declared file counts as evaluated and minified whatever its content", () => {
      const res = run([file("jquery.min.js", 90_000)], {
        "jquery.min.js": analysed(0.6),
      });
      expect(res.compliance).toBe("A");
      expect(res.offenders).toBeUndefined();
    });

    it("keeps the query out of the declaration", () => {
      const req = baseRequest("https://cdn.test/jquery.min.js?ver=3.7.1", { type: "text/javascript", responseSize: 90_000 });
      expect(minifyTextFilesRule.contentAnalyses!({ url: "u", requests: [req], page: undefined })).toEqual([]);
      expect(run([req], {}).compliance).toBe("A");
    });

    it("scenario 3: names that are not declarations are analysed", () => {
      const requests = [
        file("app-min.js", 5_000),
        file("app.minified.js", 5_000),
        file("app.min.4f3a2c.js", 5_000),
        file("icon.min.svg", 5_000),
      ];
      const jobs = minifyTextFilesRule.contentAnalyses!({ url: "u", requests, page: undefined });
      expect(jobs.map((j) => j.url)).toEqual(requests.map((r) => r.url.href));
    });

    it("scenario 4: declared files over 5 MB or without content give A and are never not-evaluated", () => {
      const res = run([file("vendor.min.js", 6_000_000), file("lib.min.js", 50_000)], {
        "lib.min.js": unavailable,
      });
      expect(res.compliance).toBe("A");
      expect(res.detail).toBe("Tous les fichiers CSS, JavaScript, HTML et SVG sont minifiés");
      expect(res.offenders).toBeUndefined();
    });

    it("grades a declared file as one evaluated file next to an offender", () => {
      const res = run([file("lib.min.js", 50_000), file("custom.css", 15_000)], { "custom.css": analysed(0.22) });
      expect(res.compliance).toBe("B");
      expect(res.detail).toBe("1 fichier sur 2 non minifié");
    });

    it("gives A without progress when pending files are all declared", () => {
      const res = run(declared, { "jquery.min.js": pending });
      expect(res.compliance).toBe("A");
      expect(res.progress).toBeUndefined();
    });

    it("computes progress over the non-declared files only", () => {
      const res = run([file("lib.min.js", 50_000), file("a.js", 5_000), file("b.js", 5_000), file("c.js", 5_000)], {
        "a.js": analysed(0.01),
        "b.js": pending,
        "c.js": pending,
      });
      expect(res.compliance).toBeUndefined();
      expect(res.progress).toEqual({ done: 1, total: 3, unit: "files" });
      expect(res.detail).toBe("Analyse en cours… (1/3 fichiers)");
    });
  });

  describe("floor of 1 000 removable characters (US-021 scenario 10)", () => {
    it("flags 1 000 removable characters at 5 % and spares 999 and 600 at 20 %", () => {
      const res = run([file("icon.svg", 3_000), file("theme.css", 20_000), file("small.css", 19_980)], {
        "icon.svg": withChars(3_000, 600),
        "theme.css": withChars(20_000, 1_000),
        "small.css": withChars(19_980, 999),
      });
      expect(res.compliance).toBe("B");
      expect(res.detail).toBe("1 fichier sur 3 non minifié");
      expect(res.offenders).toEqual(["theme.css (CSS, 20 ko) : non minifié (~5 % d'octets superflus)"]);
    });

    it("keeps the 5 % rule above the floor", () => {
      const res = run([file("big.js", 100_000)], { "big.js": withChars(100_000, 4_999) });
      expect(res.compliance).toBe("A");
    });
  });
});

describe("MinifyTextFiles indicator (US-029)", () => {
  it("scenario 7: 2 declared, 3 analysed with 1 unminified and 1 not evaluated gives 1 of 5", () => {
    const res = run(
      [
        file("a.min.js", 50_000),
        file("b.min.js", 50_000),
        file("c.js", 50_000),
        file("d.js", 50_000),
        file("e.js", 50_000),
        file("f.js", 50_000),
      ],
      { "c.js": analysed(0.6), "d.js": analysed(0.01), "e.js": analysed(0.01), "f.js": unavailable }
    );
    expect(res.compliance).toBe("B");
    expect(res.indicator).toEqual({ kind: "ratio", offenders: 1, expected: 5, unit: "unminified-files" });
  });

  it("grade C: every evaluated file is an offender", () => {
    const res = run([file("a.js", 50_000), file("b.js", 50_000)], { "a.js": analysed(0.6), "b.js": analysed(0.6) });
    expect(res.compliance).toBe("C");
    expect(res.indicator).toEqual({ kind: "ratio", offenders: 2, expected: 2, unit: "unminified-files" });
  });

  it("grade A: 0 of evaluated, declared builds included", () => {
    const res = run([file("a.js", 50_000), file("b.min.js", 50_000)], { "a.js": analysed(0.01) });
    expect(res.compliance).toBe("A");
    expect(res.indicator).toEqual({ kind: "ratio", offenders: 0, expected: 2, unit: "unminified-files" });
  });

  it("no file in scope gives A with 0 of 0", () => {
    const res = run([], {});
    expect(res.compliance).toBe("A");
    expect(res.indicator).toEqual({ kind: "ratio", offenders: 0, expected: 0, unit: "unminified-files" });
  });

  it("scenario 6: pending has no indicator", () => {
    const res = run([file("a.js", 50_000), file("b.js", 50_000)], { "a.js": analysed(0.6), "b.js": pending });
    expect(res.compliance).toBeUndefined();
    expect(res.progress).toBeDefined();
    expect(res.indicator).toBeUndefined();
  });

  it("evaluated === 0 has no compliance and no indicator", () => {
    const res = run([file("a.js", 50_000)], { "a.js": unavailable });
    expect(res.compliance).toBeUndefined();
    expect(res.indicator).toBeUndefined();
  });

  it("scenario 8: offenders is the full count above the 20-line cap", () => {
    const names = Array.from({ length: 25 }, (_, i) => `f${String(i).padStart(2, "0")}.js`);
    const res = run(names.map((n) => file(n, 50_000)), Object.fromEntries(names.map((n) => [n, analysed(0.6)])));
    expect(res.offenders!.length).toBeLessThan(25);
    expect(res.indicator).toEqual({ kind: "ratio", offenders: 25, expected: 25, unit: "unminified-files" });
  });
});
