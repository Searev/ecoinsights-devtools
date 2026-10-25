// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { UNAVAILABLE_ESTIMATES } from "../../models/image-estimation";
import { NetworkRequest } from "../../models/network-request";
import { formatKo } from "./image-rule-helpers";
import { standardFontsRule } from "./standard-fonts.rule";

const req = (url: string, o: Partial<NetworkRequest> = {}): NetworkRequest => ({
  method: "GET",
  url: new URL(url),
  code: 200,
  type: "",
  responseSize: 0,
  transferSize: 0,
  ...o,
});
const font = (name: string, size: number, o: Partial<NetworkRequest> = {}) =>
  req(`https://x.test/${name}`, { transferSize: size, ...o });
const ev = (requests: NetworkRequest[], page?: { families: string[] }) =>
  standardFontsRule.evaluate({ url: "https://x.test", requests, page, estimates: UNAVAILABLE_ESTIMATES });

describe("standardFontsRule metadata", () => {
  it("has the expected id and category", () => {
    expect(standardFontsRule.id).toBe("UseStandardFonts");
    expect(standardFontsRule.category).toBe("fonts");
  });
});

describe("standardFontsRule.evaluate", () => {
  it("is A without font files", () => {
    const r = ev([req("https://x.test/a.css", { type: "text/css" })]);
    expect(r.compliance).toBe("A");
    expect(r.detail).toBe("0 police(s) téléchargée(s) (0 ko)");
    expect(r.offenders).toEqual([]);
    expect(r.lineRefs).toBeUndefined();
  });

  it("is B for 1 or 2 files under 100 kB", () => {
    expect(ev([font("a.woff2", 40_000)]).compliance).toBe("B");
    expect(ev([font("a.woff2", 40_000), font("b.ttf", 50_000)]).compliance).toBe("B");
  });

  it("is C for 3 files or more", () => {
    expect(ev([font("a.woff", 1), font("b.otf", 1), font("c.eot", 1)]).compliance).toBe("C");
  });

  it("is C when total size reaches 100 kB", () => {
    expect(ev([font("a.woff2", 100_000)]).compliance).toBe("C");
    expect(ev([font("a.woff2", 99_999)]).compliance).toBe("B");
  });

  it("detects fonts by MIME type", () => {
    expect(ev([req("https://x.test/f?x=1", { type: "font/woff2" })]).compliance).toBe("B");
    expect(ev([req("https://x.test/f", { type: "application/font-woff" })]).compliance).toBe("B");
    expect(ev([req("https://x.test/f", { type: "application/x-font-ttf" })]).compliance).toBe("A");
  });

  it("detects fonts by extension, ignoring the query string and case", () => {
    expect(ev([req("https://x.test/f.WOFF2?v=3")]).compliance).toBe("B");
    expect(ev([req("https://x.test/woff2/page")]).compliance).toBe("A");
  });

  it("formats detail and offenders", () => {
    const r = ev([font("a.woff2", 40_000), font("b.woff2", 12_000)]);
    expect(r.detail).toBe("2 police(s) téléchargée(s) (52 ko)");
    expect(r.offenders).toEqual([`a.woff2 : ${formatKo(40_000)}`, `b.woff2 : ${formatKo(12_000)}`]);
  });

  it("appends loaded families when known", () => {
    const r = ev([font("a.woff2", 40_000)], { families: ["Roboto", "Lato"] });
    expect(r.detail).toBe("1 police(s) téléchargée(s) (40 ko) : Roboto, Lato");
  });

  it("still evaluates without page data", () => {
    const r = ev([font("a.woff2", 1)], undefined);
    expect(r.compliance).toBe("B");
    expect(r.detail).not.toContain(" : ");
  });
});

describe("standardFontsRule.evaluate lines (US-018)", () => {
  it("scenario 4: sorted by weight, largest first, grade and detail unchanged", () => {
    const r = ev([font("a.woff2", 20_000), font("b.woff2", 98_000)]);
    expect(r.offenders).toEqual([`b.woff2 : ${formatKo(98_000)}`, `a.woff2 : ${formatKo(20_000)}`]);
    expect(r.compliance).toBe("C");
    expect(r.detail).toBe("2 police(s) téléchargée(s) (118 ko)");
  });

  it("breaks ties by URL", () => {
    const r = ev([font("b.woff2", 5), font("a.woff2", 5)]);
    expect(r.offenders!.map((l) => l.split(" ")[0])).toEqual(["a.woff2", "b.woff2"]);
  });

  it("a cached font (transfer 0) shows its body size", () => {
    const r = ev([font("c.woff2", 0, { responseSize: 30_000 })]);
    expect(r.offenders).toEqual([`c.woff2 : ${formatKo(30_000)}`]);
  });

  it("collapses duplicates, ignoring the fragment, keeping the last request", () => {
    const r = ev([font("a.woff2", 10_000), font("a.woff2#x", 20_000)]);
    expect(r.offenders).toEqual([`a.woff2 : ${formatKo(20_000)}`]);
    expect(r.lineRefs).toHaveLength(1);
  });

  it("caps at 20 lines then adds '… et 1 autre', with lineRefs aligned", () => {
    const r = ev(Array.from({ length: 21 }, (_, i) => font(`f${String(i).padStart(2, "0")}.woff2`, 1_000)));
    expect(r.offenders).toHaveLength(21);
    expect(r.offenders![20]).toBe("… et 1 autre");
    expect(r.lineRefs).toHaveLength(21);
    expect(r.lineRefs![20]).toBeNull();
    expect(r.detail).toContain("21 police(s)");
  });

  it("lineRefs carry the font preview", () => {
    const r = ev([font("a.woff2", 1_000)]);
    expect(r.lineRefs).toEqual([{ url: "https://x.test/a.woff2", preview: { kind: "font" } }]);
  });

  it("the detail still counts every request, duplicates included", () => {
    const r = ev([font("a.woff2", 10_000), font("a.woff2", 10_000)]);
    expect(r.detail).toBe("2 police(s) téléchargée(s) (20 ko)");
  });
});

describe("standardFontsRule.collect", () => {
  afterEach(() => {
    delete (document as any).fonts;
  });
  const stub = (fonts: { family: string; status: string }[]) =>
    Object.defineProperty(document, "fonts", {
      value: new Set(fonts),
      configurable: true,
    });

  it("returns unique families of loaded fonts only", () => {
    stub([
      { family: "Roboto", status: "loaded" },
      { family: "Roboto", status: "loaded" },
      { family: '"Open Sans"', status: "loaded" },
      { family: "Lato", status: "unloaded" },
      { family: "Slab", status: "error" },
    ]);
    expect(standardFontsRule.collect!()).toEqual({
      families: ["Roboto", "Open Sans"],
    });
  });

  it("returns no families when document.fonts is unavailable", () => {
    expect(standardFontsRule.collect!()).toEqual({ families: [] });
  });
});

describe("US-029: indicator", () => {
  it("counts distinct font URLs: one URL requested twice plus another gives 2", () => {
    const r = ev([font("a.woff2", 10_000), font("a.woff2", 10_000), font("b.woff2", 10_000)]);
    expect(r.indicator).toEqual({ kind: "count", offenders: 2, unit: "custom-fonts" });
  });

  it("ignores the fragment when counting URLs", () => {
    const r = ev([font("a.woff2", 10_000), req("https://x.test/a.woff2#v2", { transferSize: 10_000 })]);
    expect(r.indicator).toEqual({ kind: "count", offenders: 1, unit: "custom-fonts" });
  });

  it("is 0 without font (grade A)", () => {
    const r = ev([req("https://x.test/a.css", { type: "text/css" })]);
    expect(r.compliance).toBe("A");
    expect(r.indicator).toEqual({ kind: "count", offenders: 0, unit: "custom-fonts" });
  });

  it("scenario 8: counts every font before the 20-line cap", () => {
    const r = ev(Array.from({ length: 25 }, (_, i) => font(`f${i}.woff2`, 10_000)));
    expect(r.compliance).toBe("C");
    expect(r.offenders).toHaveLength(21);
    expect(r.indicator).toEqual({ kind: "count", offenders: 25, unit: "custom-fonts" });
  });
});
