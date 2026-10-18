// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { NetworkRequest } from "../../models/network-request";
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
  standardFontsRule.evaluate({ url: "https://x.test", requests, page });

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
    expect(r.offenders).toEqual(["https://x.test/a.woff2", "https://x.test/b.woff2"]);
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
