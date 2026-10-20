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
  css: "text/css",
  html: "text/html",
  svg: "image/svg+xml",
};

function file(name: string, size: number, overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  const ext = name.split(".").pop()!;
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
      [file("app.min.js", 120_000), file("style.min.css", 30_000)],
      { "app.min.js": analysed(0.01), "style.min.css": analysed(0.02) }
    );
    expect(res.compliance).toBe("A");
    expect(res.detail).toBe("Tous les fichiers CSS, JavaScript, HTML et SVG sont minifiés");
    expect(res.offenders).toBeUndefined();
  });

  it("scenario 2: one unminified file gives B with its line", () => {
    const res = run(
      [file("app.min.js", 120_000), file("custom.css", 15_000)],
      { "app.min.js": analysed(0.01), "custom.css": analysed(0.22) }
    );
    expect(res.compliance).toBe("B");
    expect(res.detail).toBe("1 fichier sur 2 non minifié");
    expect(res.offenders).toEqual(["custom.css (CSS, 15 ko) : non minifié (~22 % d'octets superflus)"]);
    expect(res.lineRefs).toEqual([{ url: "https://cdn.test/custom.css" }]);
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
});
