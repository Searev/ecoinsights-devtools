import { describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { HttpVersion, NetworkRequest } from "../../models/network-request";
import { preferHttp2Rule } from "./prefer-http2.rule";

const req = (url: string, httpVersion?: HttpVersion, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(url),
  code: 200,
  type: "",
  responseSize: 0,
  transferSize: 100,
  ...(httpVersion !== undefined && { httpVersion }),
  ...o,
});
const many = (n: number, version: HttpVersion | undefined, host = "x.test") =>
  Array.from({ length: n }, (_, i) => req(`https://${host}/f${i}`, version));
const ev = (requests: NetworkRequest[]) =>
  preferHttp2Rule.evaluate({ url: "https://x.test/", requests, page: undefined, estimates: UNAVAILABLE_ESTIMATES });

describe("preferHttp2Rule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(preferHttp2Rule.id).toBe("PreferHttp2");
    expect(preferHttp2Rule.name).toBe("Privilégier HTTP/2 à HTTP/1");
    expect(preferHttp2Rule.category).toBe("network");
    expect(preferHttp2Rule.collect).toBeUndefined();
  });
});

describe("preferHttp2Rule.evaluate", () => {
  it("scenario 1: all h2 / h3 is A", () => {
    const r = ev([...many(30, "2"), ...many(10, "3")]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Toutes les requêtes utilisent HTTP/2 ou HTTP/3");
    expect(r.offenders ?? []).toEqual([]);
  });

  it("scenario 2: 3 of 50 is B with 6 %", () => {
    const r = ev([...many(47, "2"), ...many(3, "1.1", "old.test")]);
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe("6 % des requêtes en HTTP/1 (3 sur 50)");
  });

  it("scenario 3: exactly 10 % is C", () => {
    const r = ev([...many(45, "2"), ...many(5, "1.1", "old.test")]);
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("10 % des requêtes en HTTP/1 (5 sur 50)");
  });

  it("just under 10 % is B (integer comparison)", () => {
    expect(ev([...many(91, "2"), ...many(9, "1.1", "o.test")]).compliance).toBe("B");
    expect(ev([...many(90, "2"), ...many(10, "1.1", "o.test")]).compliance).toBe("C");
  });

  it("scenario 4: lines grouped by domain, largest count first", () => {
    const r = ev([
      ...many(2, "1.1", "ads.example.net"),
      ...many(4, "1.1", "legacy.example.org"),
      ...many(20, "2"),
    ]);
    expect(r.offenders).toEqual([
      "legacy.example.org : 4 requêtes en HTTP/1.1",
      "ads.example.net : 2 requêtes en HTTP/1.1",
    ]);
    expect(r.lineRefs).toBeUndefined();
  });

  it("uses the singular for one request", () => {
    const r = ev([...many(30, "2"), ...many(1, "1.0", "o.test")]);
    expect(r.offenders).toEqual(["o.test : 1 requête en HTTP/1.0"]);
  });

  it("shows the most frequent version of a domain, ties going to 1.1", () => {
    const mixed = [...many(2, "1.0", "o.test"), req("https://o.test/z", "1.1")];
    expect(ev([...many(30, "2"), ...mixed]).offenders).toEqual(["o.test : 3 requêtes en HTTP/1.0"]);
    const tie = [req("https://o.test/a", "1.0"), req("https://o.test/b", "1.1")];
    expect(ev([...many(30, "2"), ...tie]).offenders).toEqual(["o.test : 2 requêtes en HTTP/1.1"]);
  });

  it("orders equal counts by domain", () => {
    const r = ev([...many(20, "2"), ...many(2, "1.1", "b.test"), ...many(2, "1.1", "a.test")]);
    expect(r.offenders!.map((l) => l.split(" : ")[0])).toEqual(["a.test", "b.test"]);
  });

  it("scenario 6: cached 2xx with no transfer are excluded", () => {
    const cached = Array.from({ length: 10 }, (_, i) => req(`https://c.test/${i}`, undefined, { transferSize: 0 }));
    const cachedWrongVersion = Array.from({ length: 4 }, (_, i) => req(`https://c.test/w${i}`, "1.1", { transferSize: 0 }));
    const r = ev([...cached, ...cachedWrongVersion, ...many(5, "2")]);
    expect(r.compliance).toBe("A");
  });

  it("counts 304 responses and non-2xx with zero transfer", () => {
    const r = ev([...many(9, "2"), req("https://o.test/a", "1.1", { code: 304, transferSize: 0 })]);
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("10 % des requêtes en HTTP/1 (1 sur 10)");
  });

  it("scenario 7: no known version gives no grade", () => {
    const r = ev(many(5, undefined));
    expect(r.compliance).toBeUndefined();
    expect(r.progress).toBeUndefined();
    expect(r.detail).toBe("Version HTTP inconnue pour toutes les requêtes");
  });

  it("no request at all is A: nothing to check", () => {
    const r = ev([]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucune requête réseau à vérifier");
  });

  it("only cached 2xx responses is A: nothing to check", () => {
    const cached = Array.from({ length: 3 }, (_, i) => req(`https://c.test/${i}`, "1.1", { transferSize: 0 }));
    const r = ev([...cached, req("https://c.test/x", undefined, { transferSize: 0 })]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucune requête réseau à vérifier");
  });

  it("scenario 8: legacy requests without httpVersion do not throw", () => {
    const legacy = [{ method: "GET", url: new URL("https://x.test/"), code: 200, type: "", responseSize: 1, transferSize: 1 }];
    expect(ev(legacy).detail).toBe("Version HTTP inconnue pour toutes les requêtes");
  });

  it("shows '< 1 %' for a share under 0.5 %", () => {
    const r = ev([...many(299, "2"), ...many(1, "1.1", "o.test")]);
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe("< 1 % des requêtes en HTTP/1 (1 sur 300)");
  });

  it("rounds 0.5 % up to 1 %", () => {
    const r = ev([...many(199, "2"), ...many(1, "1.1", "o.test")]);
    expect(r.detail).toBe("1 % des requêtes en HTTP/1 (1 sur 200)");
  });

  it("caps at 20 lines", () => {
    const h1 = Array.from({ length: 25 }, (_, i) => req(`https://o${i}.test/`, "1.1"));
    const r = ev(h1);
    expect(r.compliance).toBe("C");
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 5 autres");
  });

  it("evaluates 2 000 requests in under 10 ms", () => {
    const requests = Array.from({ length: 2000 }, (_, i) =>
      req(`https://d${i % 40}.test/f${i}`, i % 7 === 0 ? "1.1" : "2")
    );
    ev(requests);
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      ev(requests);
      best = Math.min(best, performance.now() - t);
    }
    console.log(`prefer-http2 2000 requests (best of 5): ${best.toFixed(2)} ms`);
    expect(best).toBeLessThan(10);
  });
});
