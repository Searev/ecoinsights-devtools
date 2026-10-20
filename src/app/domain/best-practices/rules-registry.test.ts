// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { RULES } from "./index";

const CATEGORIES = ["content", "images", "fonts", "network", "css", "js"];

describe("RULES registry", () => {
  it("registers the thirteen rules in order (EPIC-BP2 after the first four)", () => {
    expect(RULES.map((r) => r.id)).toEqual([
      "PrintStyleSheet",
      "DontResizeImagesInBrowser",
      "UseOptimizedImageFormats",
      "UseStandardFonts",
      "ProvideTextAlternatives",
      "UseLazyLoading",
      "CompressTextFiles",
      "AddCacheHeaders",
      "MinifyTextFiles",
      "LimitDomains",
      "PreferHttp2",
      "LimitGifs",
      "AvoidMediaAutoplay",
    ]);
  });

  it("the print, resize, format, fonts, BP2 DOM and GIF (display boxes, EPIC-PV) rules have a collector", () => {
    expect(RULES.filter((r) => r.collect).map((r) => r.id)).toEqual([
      "PrintStyleSheet",
      "DontResizeImagesInBrowser",
      "UseOptimizedImageFormats",
      "UseStandardFonts",
      "ProvideTextAlternatives",
      "UseLazyLoading",
      "LimitGifs",
      "AvoidMediaAutoplay",
    ]);
  });

  it("only the minification rule declares content analyses", () => {
    expect(RULES.filter((r) => r.contentAnalyses).map((r) => r.id)).toEqual(["MinifyTextFiles"]);
  });

  it("has unique ids", () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });

  it.each(RULES.map((r) => [r.id, r] as const))("%s has valid metadata", (_, r) => {
    expect(r.name.trim()).not.toBe("");
    expect(CATEGORIES).toContain(r.category);
  });

  const collectable = RULES.filter((r) => r.collect).map((r) => [r.id, r] as const);

  it.each(collectable)("%s collect is self-contained", (_, r) => {
    const rebuilt = new Function(`return (${r.collect!.toString()})`)();
    expect(() => rebuilt()).not.toThrow();
  });

  it.each(collectable)("%s collect result is JSON-serialisable", (_, r) => {
    const out = r.collect!();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
