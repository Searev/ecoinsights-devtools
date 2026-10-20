import { describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { addCacheHeadersRule, cacheVerdict } from "./add-cache-headers.rule";

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const DATE = "Tue, 20 Oct 2026 12:00:00 GMT";

const req = (path: string, headers: Record<string, string> | undefined, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(`https://x.test${path}`),
  code: 200,
  type: "",
  responseSize: 1_000,
  transferSize: 1_000,
  responseHeaders: headers,
  ...o,
});
const ev = (requests: NetworkRequest[]) =>
  addCacheHeadersRule.evaluate({ url: "https://x.test", requests, page: undefined, estimates: UNAVAILABLE_ESTIMATES });

const ALL_OK = "Tous les fichiers statiques peuvent être mis en cache";

describe("addCacheHeadersRule metadata", () => {
  it("has the expected id, name and category, and no collector", () => {
    expect(addCacheHeadersRule.id).toBe("AddCacheHeaders");
    expect(addCacheHeadersRule.name).toBe("Ajouter des entêtes Expires ou Cache-Control");
    expect(addCacheHeadersRule.category).toBe("network");
    expect(addCacheHeadersRule.collect).toBeUndefined();
  });
});

describe("cacheVerdict", () => {
  const ok = { compliant: true };
  const no = (reason: string) => ({ compliant: false, reason });
  const v = (h: Record<string, string> | undefined, startedAt?: number) => cacheVerdict(h, startedAt);

  it("applies the Cache-Control directives", () => {
    expect(v({ "cache-control": "no-store" })).toEqual(no("Cache-Control: no-store"));
    expect(v({ "cache-control": "no-cache" })).toEqual(no("Cache-Control: no-cache"));
    expect(v({ "cache-control": "max-age=0" })).toEqual(no("max-age=0"));
    expect(v({ "cache-control": "max-age=3600" })).toEqual(ok);
    expect(v({ "cache-control": "public, max-age=31536000, immutable" })).toEqual(ok);
    expect(v({ "cache-control": "immutable" })).toEqual(ok);
  });

  it("is case-insensitive and tolerates spaces", () => {
    expect(v({ "cache-control": " Public ,  MAX-AGE=60 " })).toEqual(ok);
    expect(v({ "cache-control": "No-Store" })).toEqual(no("Cache-Control: no-store"));
  });

  it("gives priority no-store, no-cache, max-age=0 over a positive max-age", () => {
    expect(v({ "cache-control": "max-age=600, no-cache, no-store" })).toEqual(no("Cache-Control: no-store"));
    expect(v({ "cache-control": "max-age=600, no-cache" })).toEqual(no("Cache-Control: no-cache"));
    expect(v({ "cache-control": "max-age=0, max-age=600" })).toEqual(no("max-age=0"));
  });

  it("accepts a quoted max-age and ignores a non-integer one", () => {
    expect(v({ "cache-control": 'max-age="120"' })).toEqual(ok);
    expect(v({ "cache-control": 'max-age="0"' })).toEqual(no("max-age=0"));
    expect(v({ "cache-control": "max-age=abc" })).toEqual(no("Cache-Control sans durée de cache"));
    expect(v({ "cache-control": "max-age=1.5" })).toEqual(no("Cache-Control sans durée de cache"));
    expect(v({ "cache-control": "max-age=" })).toEqual(no("Cache-Control sans durée de cache"));
    expect(v({ "cache-control": "max-age=-5" })).toEqual(no("Cache-Control sans durée de cache"));
  });

  it("ignores s-maxage", () => {
    expect(v({ "cache-control": "s-maxage=600" })).toEqual(no("Cache-Control sans durée de cache"));
    expect(v({ "cache-control": "s-maxage=600, max-age=0" })).toEqual(no("max-age=0"));
  });

  it("reports Cache-Control without a duration, and falls back to Expires", () => {
    expect(v({ "cache-control": "private" })).toEqual(no("Cache-Control sans durée de cache"));
    expect(v({ "cache-control": "public" })).toEqual(no("Cache-Control sans durée de cache"));
    expect(v({ "cache-control": "private", expires: "Wed, 21 Oct 2026 12:00:00 GMT", date: DATE })).toEqual(ok);
  });

  it("lets Cache-Control win over Expires", () => {
    expect(v({ "cache-control": "no-cache", expires: "Wed, 21 Oct 2026 12:00:00 GMT", date: DATE })).toEqual(
      no("Cache-Control: no-cache")
    );
    expect(v({ "cache-control": "max-age=60", expires: "0" })).toEqual(ok);
  });

  it("compares Expires with the Date header", () => {
    expect(v({ expires: "Wed, 21 Oct 2026 12:00:00 GMT", date: DATE })).toEqual(ok);
    expect(v({ expires: "Mon, 19 Oct 2026 12:00:00 GMT", date: DATE })).toEqual(no("Expires dans le passé"));
    expect(v({ expires: DATE, date: DATE })).toEqual(no("Expires dans le passé"));
  });

  it("falls back to startedAt when Date is missing or invalid", () => {
    expect(v({ expires: "Wed, 21 Oct 2026 12:00:00 GMT" }, NOW)).toEqual(ok);
    expect(v({ expires: "Mon, 19 Oct 2026 12:00:00 GMT" }, NOW)).toEqual(no("Expires dans le passé"));
    expect(v({ expires: "Mon, 19 Oct 2026 12:00:00 GMT", date: "garbage" }, NOW)).toEqual(no("Expires dans le passé"));
  });

  it("treats a valid Expires as compliant when there is no reference time (legacy)", () => {
    expect(v({ expires: "Mon, 19 Oct 2026 12:00:00 GMT" })).toEqual(ok);
  });

  it("reads the three HTTP-date formats", () => {
    const h = (expires: string) => v({ expires, date: "Sun, 06 Nov 1994 08:00:00 GMT" });
    expect(h("Sun, 06 Nov 1994 08:49:37 GMT")).toEqual(ok);
    expect(h("Sunday, 06-Nov-94 08:49:37 GMT")).toEqual(ok);
    expect(h("Sun Nov  6 08:49:37 1994")).toEqual(ok);
    expect(h("Sun Nov 06 08:49:37 1994")).toEqual(ok);
    expect(h("Sun, 06 Nov 1994 07:49:37 GMT")).toEqual(no("Expires dans le passé"));
  });

  it("rejects invalid Expires values", () => {
    for (const expires of ["0", "-1", "123456", "never", "", "2026-10-21", "2026-10-21T12:00:00Z", "Wed, 31 Foo 2026 12:00:00 GMT"]) {
      expect(v({ expires, date: DATE })).toEqual(no("Expires invalide"));
    }
  });

  it("reports missing headers", () => {
    expect(v({})).toEqual(no("aucune entête de cache"));
    expect(v(undefined)).toEqual(no("aucune entête de cache"));
    expect(v({ etag: "abc", "last-modified": DATE })).toEqual(no("aucune entête de cache"));
  });

  it("never throws on malformed values", () => {
    const weird = ["", ",,,", "=", "max-age", "max-age==5", "\u0000", "a".repeat(10_000)];
    for (const w of weird) {
      expect(() => v({ "cache-control": w, expires: w, date: w }, Number.NaN)).not.toThrow();
    }
    expect(v({ "cache-control": "", expires: "" })).toEqual(no("Expires invalide"));
  });
});

describe("addCacheHeadersRule.evaluate", () => {
  const good = { "cache-control": "public, max-age=31536000, immutable" };

  it("scenario 1: all cacheable gives A", () => {
    const r = ev([
      req("/app.js", good),
      req("/logo.png", { expires: "Wed, 20 Oct 2027 12:00:00 GMT", date: DATE }),
    ]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe(ALL_OK);
    expect(r.offenders).toBeUndefined();
  });

  it("scenario 2: some files without caching give B", () => {
    const r = ev([req("/style.css", { "cache-control": "max-age=3600" }), req("/font.woff2", {})]);
    expect(r.compliance).toBe("B");
    expect(r.offenders).toEqual(["font.woff2 : aucune entête de cache"]);
    expect(r.lineRefs).toEqual([{ url: "https://x.test/font.woff2" }]);
    expect(r.detail).toBe("1 fichier statique sur 2 ne peut pas être mis en cache");
  });

  it("scenario 3: none cacheable gives C", () => {
    const r = ev([req("/a.js", {}), req("/b.css", {}), req("/c.png", {})]);
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("3 fichiers statiques sur 3 ne peuvent pas être mis en cache");
  });

  it("scenario 4: caching-forbidding headers are listed with their reason", () => {
    const r = ev([
      req("/a.js", { "cache-control": "no-store" }),
      req("/b.js", { "cache-control": "no-cache" }),
      req("/c.js", { "cache-control": "max-age=0" }),
    ]);
    expect(r.offenders).toEqual([
      "a.js : Cache-Control: no-store",
      "b.js : Cache-Control: no-cache",
      "c.js : max-age=0",
    ]);
  });

  it("scenario 5: Cache-Control takes precedence over Expires", () => {
    const r = ev([
      req("/a.js", { "cache-control": "no-cache", expires: "Wed, 20 Oct 2027 12:00:00 GMT", date: DATE }),
      req("/b.js", good),
    ]);
    expect(r.offenders).toEqual(["a.js : Cache-Control: no-cache"]);
  });

  it("scenario 6: Expires in the past or invalid", () => {
    const r = ev([
      req("/a.js", { expires: "Mon, 19 Oct 2026 12:00:00 GMT", date: DATE }, { responseSize: 2_000 }),
      req("/b.js", { expires: "0" }),
    ]);
    expect(r.offenders).toEqual(["a.js : Expires dans le passé", "b.js : Expires invalide"]);
  });

  it("uses startedAt as the reference when Date is missing", () => {
    const r = ev([req("/a.js", { expires: "Mon, 19 Oct 2026 12:00:00 GMT" }, { startedAt: NOW })]);
    expect(r.offenders).toEqual(["a.js : Expires dans le passé"]);
  });

  it("scenario 7: static file without extension detected by MIME", () => {
    const r = ev([req("/fonts/roboto?family=Roboto", {}, { type: "font/woff2" })]);
    expect(r.compliance).toBe("C");
    expect(r.offenders).toEqual(["roboto : aucune entête de cache"]);
    for (const type of [
      "image/svg+xml", "audio/mpeg", "video/mp4", "text/css", "text/javascript", "application/javascript",
      "application/x-javascript", "application/ecmascript", "application/font-woff", "application/x-font-ttf",
      "application/zip", "application/gzip", "application/xml", "application/rss+xml", "application/atom+xml",
    ]) {
      expect(ev([req("/asset", {}, { type })]).offenders, type).toHaveLength(1);
    }
  });

  it("does not treat other MIME types without extension as static", () => {
    for (const type of ["text/html", "application/json", "text/plain", "text/xml", ""]) {
      expect(ev([req("/asset", {}, { type })]).compliance, type).toBe("A");
    }
  });

  it("scenario 8: HTML pages and unlisted extensions are not static files", () => {
    expect(ev([req("/index.html", {}, { type: "text/html" }), req("/a.json", {}), req("/b.php", {})]).compliance).toBe("A");
  });

  it("an extension decides even when the MIME type says otherwise", () => {
    expect(ev([req("/data.json", {}, { type: "image/png" })]).compliance).toBe("A");
    expect(ev([req("/A.PNG?v=1", {})]).compliance).toBe("C");
  });

  it("knows every extension of the list, including the product additions", () => {
    const exts = "xml ogg ogv svg svgz eot otf woff woff2 mp4 ttf css rss atom js mjs jpg jpeg gif png ico zip tgz gz rar bz2 doc xls exe ppt tar mid midi wav bmp rtf webp avif webm mp3 m4a".split(" ");
    for (const ext of exts) {
      expect(ev([req(`/f.${ext}`, {})]).offenders, ext).toHaveLength(1);
    }
  });

  it("scenario 9: a 304 carries the stored headers", () => {
    const r = ev([req("/app.js", { "cache-control": "max-age=600" }, { code: 304 })]);
    expect(r.compliance).toBe("A");
    expect(ev([req("/app.js", {}, { code: 304 })]).compliance).toBe("C");
  });

  it("ignores other statuses", () => {
    expect(ev([req("/a.js", {}, { code: 404 }), req("/b.js", {}, { code: 301 })]).compliance).toBe("A");
  });

  it("scenario 10: no static file gives A", () => {
    const r = ev([req("/index.html", {}, { type: "text/html" }), req("/api/items", {}, { type: "application/json" })]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe(ALL_OK);
  });

  it("counts a URL once, keeping the last request", () => {
    expect(ev([req("/a.js", {}), req("/a.js", good)]).compliance).toBe("A");
  });

  it("sorts by size descending then URL, and caps at 20 lines", () => {
    const small = ev([req("/b.js", {}), req("/a.js", {}), req("/big.js", {}, { responseSize: 9_000 })]);
    expect(small.offenders!.map((l) => l.split(" ")[0])).toEqual(["big.js", "a.js", "b.js"]);
    const many = ev(Array.from({ length: 25 }, (_, i) => req(`/f${String(i).padStart(2, "0")}.js`, {})));
    expect(many.offenders).toHaveLength(21);
    expect(many.offenders![20]).toBe("… et 5 autres");
    expect(many.lineRefs![20]).toBeNull();
    expect(many.lineRefs).toHaveLength(21);
  });

  it("evaluates 2 000 requests in under 10 ms", () => {
    const requests = Array.from({ length: 2_000 }, (_, i) =>
      req(`/f${i}.js`, i % 2 ? good : { expires: "Mon, 19 Oct 2026 12:00:00 GMT", date: DATE })
    );
    ev(requests);
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      ev(requests);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(10);
  });
});
