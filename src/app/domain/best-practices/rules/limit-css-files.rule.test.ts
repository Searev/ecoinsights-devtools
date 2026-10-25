import { describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { limitCssFilesRule } from "./limit-css-files.rule";
import { formatCount } from "./rule-lines";
import { formatKo } from "./image-rule-helpers";

const req = (path: string, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(`https://x.test${path}`),
  code: 200,
  type: "text/css",
  responseSize: 1_000,
  transferSize: 1_000,
  ...o,
});
const ev = (requests: NetworkRequest[]) =>
  limitCssFilesRule.evaluate({ url: "https://x.test", requests, page: undefined, estimates: UNAVAILABLE_ESTIMATES });
const many = (n: number) => Array.from({ length: n }, (_, i) => req(`/s${String(i).padStart(2, "0")}.css`));

const B_DETAIL =
  "fichiers CSS : vérifier que les styles ne sont pas regroupés dans un fichier trop volumineux ou intégrés à la page";

describe("limitCssFilesRule metadata", () => {
  it("has the expected id, name and category, and no collector", () => {
    expect(limitCssFilesRule.id).toBe("LimitCssFiles");
    expect(limitCssFilesRule.name).toBe("Limiter le nombre de fichiers CSS");
    expect(limitCssFilesRule.category).toBe("css");
    expect(limitCssFilesRule.collect).toBeUndefined();
  });
});

describe("limitCssFilesRule", () => {
  it("scenario 1: 4 files give A, no lines", () => {
    const r = ev(many(4));
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("4 fichiers CSS");
    expect(r.offenders).toBeUndefined();
    expect(r.lineRefs).toBeUndefined();
  });

  it("scenario 2: boundaries 3 and 10 give A", () => {
    expect(ev(many(3)).compliance).toBe("A");
    expect(ev(many(3)).detail).toBe("3 fichiers CSS");
    expect(ev(many(10)).compliance).toBe("A");
    expect(ev(many(10)).offenders).toBeUndefined();
  });

  it("scenario 3: two files give B with lines, largest first", () => {
    const r = ev([
      req("/fonts.css", { transferSize: 2_000 }),
      req("/app.css", { transferSize: 180_000 }),
    ]);
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe(`2 ${B_DETAIL}`);
    expect(r.offenders).toEqual([`app.css : ${formatKo(180_000)}`, `fonts.css : ${formatKo(2_000)}`]);
    expect(r.offenders).toEqual(["app.css : 180 ko", "fonts.css : 2 ko"]);
    expect(r.lineRefs).toEqual([{ url: "https://x.test/app.css" }, { url: "https://x.test/fonts.css" }]);
    expect(r.lineRefs?.every((ref) => ref !== null && ref.preview === undefined)).toBe(true);
  });

  it("scenario 4: no CSS file gives B, no lines", () => {
    const r = ev([req("/a.js", { type: "text/javascript" })]);
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe("Aucun fichier CSS : vérifier que les styles ne sont pas intégrés à la page");
    expect(r.offenders).toBeUndefined();
    expect(ev([]).compliance).toBe("B");
  });

  it("scenario 5: 11 files give C, all listed largest first", () => {
    const requests = many(11).map((r, i) => ({ ...r, transferSize: (i + 1) * 1_000 }));
    const r = ev(requests);
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("11 fichiers CSS : à regrouper (10 au plus recommandés)");
    expect(r.offenders).toHaveLength(11);
    expect(r.offenders?.[0]).toBe("s10.css : 11 ko");
    expect(r.offenders?.[10]).toBe("s00.css : 1 ko");
  });

  it("scenario 5: 21 files are capped at 20 lines plus '… et 1 autre'", () => {
    const r = ev(many(21));
    expect(r.compliance).toBe("C");
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders?.[20]).toBe("… et 1 autre");
    expect(ev(many(25)).offenders?.[20]).toBe("… et 5 autres");
    expect(r.lineRefs?.[20]).toBeNull();
  });

  it("scenario 5: formats the count with formatCount", () => {
    const r = ev(many(1500));
    expect(r.detail).toBe(`${formatCount(1500)} fichiers CSS : à regrouper (10 au plus recommandés)`);
  });

  it("sorts equal weights by URL", () => {
    const r = ev([req("/b.css"), req("/a.css")]);
    expect(r.offenders).toEqual(["a.css : 1 ko", "b.css : 1 ko"]);
  });

  it("scenario 6: duplicates count once, 404 ignored, 304 counted", () => {
    const r = ev([
      req("/app.css"),
      req("/app.css"),
      req("/old.css", { code: 404 }),
      req("/theme.css", { code: 304, transferSize: 0, responseSize: 5_000 }),
    ]);
    expect(r.detail).toBe(`2 ${B_DETAIL}`);
    expect(r.offenders).toEqual(["theme.css : 5 ko", "app.css : 1 ko"]);
  });

  it("weights a 304 by its decoded size, falling back to the transferred size", () => {
    const decoded = ev([req("/t.css", { code: 304, transferSize: 300, responseSize: 5_000 })]);
    expect(decoded.offenders).toEqual(["t.css : 5 ko"]);
    const transferred = ev([req("/t.css", { code: 304, transferSize: 7_000, responseSize: 0 })]);
    expect(transferred.offenders).toEqual(["t.css : 7 ko"]);
  });

  it("weights a 200 by its transferred size, else the decoded size", () => {
    expect(ev([req("/t.css", { transferSize: 3_000, responseSize: 9_000 })]).offenders).toEqual(["t.css : 3 ko"]);
    expect(ev([req("/t.css", { transferSize: 0, responseSize: 9_000 })]).offenders).toEqual(["t.css : 9 ko"]);
  });

  it("scenario 7: detects by extension or MIME type", () => {
    const r = ev([
      req("/assets/site.css", { type: "application/octet-stream" }),
      req("/style.php", { type: "text/css" }),
      req("/x.css", { type: "text/plain" }),
      req("/empty.css", { type: "" }),
    ]);
    expect(r.detail).toBe(`3 fichiers CSS`);
    expect(r.compliance).toBe("A");
  });

  it("uses the singular for one file", () => {
    const r = ev([req("/a.css")]);
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe(`1 fichier ${B_DETAIL.slice("fichiers ".length)}`);
    expect(r.offenders).toEqual(["a.css : 1 ko"]);
  });

  it("counts a fragment variant once and ignores a 500", () => {
    const r = ev([req("/a.css#x"), req("/a.css"), req("/b.css", { code: 500 })]);
    expect(r.detail).toBe(`1 fichier ${B_DETAIL.slice("fichiers ".length)}`);
  });

  it("grade boundaries 2, 3, 10, 11", () => {
    expect([2, 3, 10, 11].map((n) => ev(many(n)).compliance)).toEqual(["B", "A", "A", "C"]);
  });

  it("NFR: 2 000 requests in under 10 ms (best of 10)", () => {
    const requests = Array.from({ length: 2_000 }, (_, i) =>
      req(`/f${i}.${i % 2 === 0 ? "css" : "png"}`, i % 2 === 0 ? {} : { type: "image/png" })
    );
    let best = Infinity;
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      ev(requests);
      best = Math.min(best, performance.now() - start);
    }
    console.info(`LimitCssFiles 2000 requests best of 10: ${best.toFixed(2)} ms`);
    expect(best).toBeLessThan(10);
  });
});
