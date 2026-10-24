import { describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { formatKo } from "./image-rule-helpers";
import { limitDomainsRule } from "./limit-domains.rule";

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
  limitDomainsRule.evaluate({ url: "https://example.org/", requests, page: undefined, estimates: UNAVAILABLE_ESTIMATES });
const hosts = (n: number) => Array.from({ length: n }, (_, i) => req(`https://d${i}.test/a.js`));

describe("limitDomainsRule metadata", () => {
  it("has the expected id, name and category", () => {
    expect(limitDomainsRule.id).toBe("LimitDomains");
    expect(limitDomainsRule.name).toBe("Limiter le nombre de domaines servant les ressources");
    expect(limitDomainsRule.category).toBe("network");
    expect(limitDomainsRule.collect).toBeUndefined();
  });
});

describe("limitDomainsRule.evaluate", () => {
  it("scenario 1: 3 domains is A", () => {
    const r = ev([
      req("https://example.org/"),
      req("https://cdn.example.org/a.js"),
      req("https://fonts.gstatic.com/f.woff2"),
    ]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("3 domaines servent les ressources de la page");
  });

  it("scenario 2: exactly 5 domains is B", () => {
    expect(ev(hosts(5)).compliance).toBe("B");
  });

  it("boundaries 4 / 5 / 6", () => {
    expect(ev(hosts(4)).compliance).toBe("A");
    expect(ev(hosts(5)).compliance).toBe("B");
    expect(ev(hosts(6)).compliance).toBe("C");
  });

  it("scenario 3: 8 domains is C, listed by request count descending", () => {
    const requests = hosts(8);
    requests.push(req("https://d3.test/b.js"), req("https://d3.test/c.js"), req("https://d6.test/b.js"));
    const r = ev(requests);
    expect(r.compliance).toBe("C");
    expect(r.offenders).toHaveLength(8);
    expect(r.offenders![0]).toMatch(/^d3\.test : 3 requêtes, /);
    expect(r.offenders![1]).toMatch(/^d6\.test : 2 requêtes, /);
  });

  it("scenario 4: sub-domains count separately", () => {
    const r = ev([req("https://www.example.org/"), req("https://example.org/a")]);
    expect(r.detail).toBe("2 domaines servent les ressources de la page");
  });

  it("scenario 5: normalises case, port and trailing dot", () => {
    const r = ev([req("https://CDN.Example.org:8443/a.js"), req("https://cdn.example.org./b.js")]);
    expect(r.detail).toBe("1 domaine sert les ressources de la page");
    expect(r.offenders).toHaveLength(1);
    expect(r.offenders![0].startsWith("cdn.example.org : 2 requêtes")).toBe(true);
  });

  it("scenario 6: a single request is A with the singular wording", () => {
    const r = ev([req("https://example.org/", { transferSize: 1500 })]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("1 domaine sert les ressources de la page");
    expect(r.offenders).toEqual([`example.org : 1 requête, ${formatKo(1500)}`]);
  });

  it("no request at all is A with an explicit detail", () => {
    const r = ev([]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("Aucune ressource chargée par la page");
    expect(r.offenders ?? []).toEqual([]);
  });

  it("sums transferred bytes and counts every status", () => {
    const r = ev([
      req("https://a.test/1", { transferSize: 400_000 }),
      req("https://a.test/2", { transferSize: 600_000, code: 404 }),
    ]);
    expect(r.offenders).toEqual([`a.test : 2 requêtes, ${formatKo(1_000_000)}`]);
  });

  it("orders ties by bytes descending then domain", () => {
    const r = ev([
      req("https://b.test/", { transferSize: 10_000 }),
      req("https://a.test/", { transferSize: 10_000 }),
      req("https://c.test/", { transferSize: 50_000 }),
    ]);
    expect(r.offenders!.map((l) => l.split(" : ")[0])).toEqual(["c.test", "a.test", "b.test"]);
  });

  it("caps at 20 lines and sets no lineRefs", () => {
    const r = ev(hosts(25));
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 5 autres");
    expect(r.lineRefs).toBeUndefined();
  });

  it("evaluates 2 000 requests in under 10 ms", () => {
    const requests = Array.from({ length: 2000 }, (_, i) => req(`https://d${i % 40}.test/f${i}.js`, { transferSize: i }));
    ev(requests);
    let best = Infinity;
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      ev(requests);
      best = Math.min(best, performance.now() - t);
    }
    console.log(`limit-domains 2000 requests (best of 10): ${best.toFixed(2)} ms`);
    expect(best).toBeLessThan(10);
  });
});
