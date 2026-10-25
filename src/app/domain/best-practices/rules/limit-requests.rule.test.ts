import { describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { limitRequestsRule } from "./limit-requests.rule";
import { formatCount } from "./rule-lines";

const req = (url: string, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(url),
  code: 200,
  type: "",
  responseSize: 0,
  transferSize: 0,
  ...o,
});
const ev = (requests: NetworkRequest[]) =>
  limitRequestsRule.evaluate({ url: "https://example.org/", requests, page: undefined, estimates: UNAVAILABLE_ESTIMATES });
const many = (n: number, o: Partial<NetworkRequest> = {}) =>
  Array.from({ length: n }, (_, i) => req(`https://example.org/f${i}.js`, o));

describe("limitRequestsRule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(limitRequestsRule.id).toBe("LimitRequests");
    expect(limitRequestsRule.name).toBe("Limiter le nombre de requêtes HTTP");
    expect(limitRequestsRule.category).toBe("network");
    expect(limitRequestsRule.collect).toBeUndefined();
  });
});

describe("limitRequestsRule.evaluate", () => {
  it("scenario 1: 25 requests is A", () => {
    const r = ev(many(25));
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("25 requêtes HTTP");
  });

  it("scenario 2: 40 is A, 41 is B", () => {
    expect(ev(many(40)).compliance).toBe("A");
    const r = ev(many(41));
    expect(r.compliance).toBe("B");
    expect(r.detail).toBe("41 requêtes HTTP (40 au plus recommandées)");
  });

  it("scenario 3: 70 is B, 71 is C", () => {
    expect(ev(many(70)).compliance).toBe("B");
    const r = ev(many(71));
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("71 requêtes HTTP (40 au plus recommandées)");
  });

  it("scenario 4: every request counts (404, 304, redirect, duplicates)", () => {
    const requests = [
      ...many(38),
      req("https://example.org/m1", { code: 404 }),
      req("https://example.org/m2", { code: 404 }),
      req("https://example.org/c", { code: 304 }),
      req("https://example.org/r", { code: 301 }),
    ];
    const r = ev(requests);
    expect(r.detail).toBe("42 requêtes HTTP (40 au plus recommandées)");
    expect(r.compliance).toBe("B");
  });

  it("counts duplicates of one URL each", () => {
    expect(ev(many(42).map(() => req("https://example.org/same.js"))).detail).toBe(
      "42 requêtes HTTP (40 au plus recommandées)"
    );
  });

  it("scenario 6: no request is A with the singular form", () => {
    const r = ev([]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("0 requête HTTP");
  });

  it("uses the singular for one request", () => {
    expect(ev(many(1)).detail).toBe("1 requête HTTP");
  });

  it("formats large counts with formatCount", () => {
    const r = ev(many(1500));
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe(`${formatCount(1500)} requêtes HTTP (40 au plus recommandées)`);
  });

  it("has no offenders and no lineRefs", () => {
    const r = ev(many(80));
    expect(r.offenders).toBeUndefined();
    expect(r.lineRefs).toBeUndefined();
  });
});

describe("limitRequestsRule indicator (US-029)", () => {
  it("counts every request in every graded branch", () => {
    for (const [n, grade] of [[0, "A"], [25, "A"], [41, "B"], [52, "B"], [71, "C"]] as const) {
      const r = ev(many(n));
      expect(r.compliance).toBe(grade);
      expect(r.indicator).toEqual({ kind: "count", offenders: n, unit: "requests" });
    }
  });

  it("scenario 3: 52 requests gives a count of 52", () => {
    expect(ev(many(52)).indicator).toEqual({ kind: "count", offenders: 52, unit: "requests" });
  });
});
