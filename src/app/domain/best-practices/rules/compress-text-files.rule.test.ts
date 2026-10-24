import { describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { formatKo } from "./image-rule-helpers";
import { compressTextFilesRule } from "./compress-text-files.rule";

const req = (path: string, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(`https://x.test${path}`),
  code: 200,
  type: "",
  responseSize: 10_000,
  transferSize: 5_000,
  responseHeaders: {},
  ...o,
});
const js = (path: string, encoding?: string, size = 40_000) =>
  req(path, {
    type: "text/javascript",
    responseSize: size,
    responseHeaders: encoding === undefined ? { server: "x" } : { "content-encoding": encoding },
  });
const css = (path: string, encoding?: string, size = 12_000) =>
  req(path, {
    type: "text/css",
    responseSize: size,
    responseHeaders: encoding === undefined ? { server: "x" } : { "content-encoding": encoding },
  });
const ev = (requests: NetworkRequest[]) =>
  compressTextFilesRule.evaluate({ url: "https://x.test", requests, page: undefined, estimates: UNAVAILABLE_ESTIMATES });

const ALL_OK = "Tous les fichiers textuels sont compressés";

describe("compressTextFilesRule metadata", () => {
  it("has the expected id, name and category, and no collector", () => {
    expect(compressTextFilesRule.id).toBe("CompressTextFiles");
    expect(compressTextFilesRule.name).toBe("Compresser les fichiers textuels");
    expect(compressTextFilesRule.category).toBe("network");
    expect(compressTextFilesRule.collect).toBeUndefined();
  });
});

describe("compressTextFilesRule.evaluate", () => {
  it("scenario 1: all compressed gives A", () => {
    const r = ev([js("/app.js", "br"), css("/style.css", "gzip")]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe(ALL_OK);
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 2: one uncompressed file gives C", () => {
    const r = ev([js("/vendor.js", undefined, 250_000)]);
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([`vendor.js (JS, ${formatKo(250_000)}) : non compressé`]);
    expect(r.lineRefs).toEqual([{ url: "https://x.test/vendor.js" }]);
    expect(r.detail).toBe("1 fichier textuel non compressé");
  });

  it("scenario 3: deflate gives B", () => {
    const r = ev([js("/app.js", "br"), css("/legacy.css", "deflate", 8_000)]);
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual([`legacy.css (CSS, ${formatKo(8_000)}) : compression faible (deflate)`]);
    expect(r.detail).toBe("1 fichier textuel en compression faible (deflate)");
  });

  it("scenario 4: C wins over B, uncompressed first", () => {
    const r = ev([css("/legacy.css", "deflate", 90_000), js("/vendor.js", undefined, 1_000)]);
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("1 fichier textuel non compressé, 1 en compression faible (deflate)");
    expect(r.offenders).toEqual([
      `vendor.js (JS, ${formatKo(1_000)}) : non compressé`,
      `legacy.css (CSS, ${formatKo(90_000)}) : compression faible (deflate)`,
    ]);
  });

  it("agrees the detail in the plural", () => {
    const r = ev([js("/a.js"), js("/b.js"), css("/c.css", "deflate")]);
    expect(r.detail).toBe("2 fichiers textuels non compressés, 1 en compression faible (deflate)");
    expect(ev([css("/c.css", "deflate"), css("/d.css", "deflate")]).detail).toBe(
      "2 fichiers textuels en compression faible (deflate)"
    );
  });

  it("scenario 5: zstd and x-gzip count as good", () => {
    expect(ev([js("/app.js", "zstd"), js("/b.js", "x-gzip")]).compliance).toBe("A");
  });

  it("scenario 6: files under 1 000 bytes are ignored, 1 000 is checked", () => {
    const r = ev([js("/tiny.js", undefined, 600)]);
    expect(r.compliance).toBe("A");
    expect(r.offenders).toBeUndefined();
    expect(ev([js("/edge.js", undefined, 999)]).compliance).toBe("A");
    expect(ev([js("/edge.js", undefined, 1_000)]).compliance).toBe("C");
  });

  it("scenario 7: type detected from the extension when MIME is generic", () => {
    const r = ev([
      req("/assets/main.js", {
        type: "application/octet-stream",
        responseSize: 30_000,
        responseHeaders: { server: "x" },
      }),
    ]);
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual([`main.js (JS, ${formatKo(30_000)}) : non compressé`]);
  });

  it("scenario 8: 304 and errors are ignored", () => {
    expect(ev([{ ...css("/style.css"), code: 304 }, { ...js("/missing.js"), code: 404 }]).compliance).toBe("A");
  });

  it("scenario 9: header value case and multiple encodings", () => {
    const r = ev([js("/a.js", "GZIP"), js("/b.js", "deflate, br")]);
    expect(r.compliance).toBe("A");
    expect(ev([js("/c.js", "br, identity")]).compliance).toBe("C");
  });

  it("scenario 10: only small files gives A with the all-compressed detail", () => {
    const r = ev([js("/a.js", undefined, 500), css("/b.css", undefined, 100)]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe(ALL_OK);
  });

  it("treats identity and an empty encoding as not compressed", () => {
    expect(ev([js("/a.js", "identity")]).compliance).toBe("C");
    expect(ev([js("/a.js", " , ")]).compliance).toBe("C");
  });

  it("counts an unknown encoding as compressed and mentions it in the detail", () => {
    const r = ev([js("/a.js", "compress"), css("/b.css", "Foo"), js("/c.js", "compress")]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe(
      `${ALL_OK} (encodage non reconnu considéré comme compressé : compress, foo)`
    );
    const withIssue = ev([js("/a.js", "compress"), js("/b.js")]);
    expect(withIssue.detail).toBe(
      "1 fichier textuel non compressé (encodage non reconnu considéré comme compressé : compress)"
    );
  });

  it("covers HTML and SVG, with MIME parameters absent and case-insensitive MIME", () => {
    const r = ev([
      req("/", { type: "text/html", responseHeaders: { a: "b" } }),
      req("/i.svg", { type: "IMAGE/SVG+XML", responseHeaders: { a: "b" } }),
    ]);
    expect(r.offenders).toEqual([
      `x.test (HTML, ${formatKo(10_000)}) : non compressé`,
      `i.svg (SVG, ${formatKo(10_000)}) : non compressé`,
    ]);
  });

  it("ignores non-text types", () => {
    expect(ev([req("/a.json", { type: "application/json", responseHeaders: { a: "b" } })]).compliance).toBe("A");
  });

  it("excludes responses without recorded headers", () => {
    const noHeaders = { ...js("/a.js"), responseHeaders: undefined };
    const empty = { ...js("/b.js"), responseHeaders: {} };
    expect(ev([noHeaders, empty]).compliance).toBe("A");
  });

  it("counts a URL once, keeping the last request", () => {
    const r = ev([js("/a.js"), js("/a.js", "br")]);
    expect(r.compliance).toBe("A");
  });

  it("sorts by class, then size descending, then URL", () => {
    const r = ev([
      js("/b.js", undefined, 5_000),
      js("/a.js", undefined, 5_000),
      js("/big.js", undefined, 90_000),
      css("/d.css", "deflate", 500_000),
    ]);
    expect(r.offenders!.map((l) => l.split(" ")[0])).toEqual(["big.js", "a.js", "b.js", "d.css"]);
  });

  it("caps at 20 lines with lineRefs aligned", () => {
    const requests = Array.from({ length: 23 }, (_, i) => js(`/f${String(i).padStart(2, "0")}.js`));
    const r = ev(requests);
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 3 autres");
    expect(r.lineRefs).toHaveLength(21);
    expect(r.lineRefs![20]).toBeNull();
    expect(r.lineRefs![0]).toEqual({ url: "https://x.test/f00.js" });
  });

  it("evaluates 2 000 requests in under 10 ms", () => {
    const requests = Array.from({ length: 2_000 }, (_, i) => js(`/f${i}.js`, i % 3 === 0 ? undefined : "br"));
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
