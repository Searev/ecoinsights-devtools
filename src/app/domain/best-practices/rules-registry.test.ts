// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { RULES } from "./index";

const CATEGORIES = ["content", "images", "fonts", "network", "css", "js"];

describe("RULES registry", () => {
  it("registers the three rules in order", () => {
    expect(RULES.map((r) => r.id)).toEqual([
      "PrintStyleSheet",
      "DontResizeImagesInBrowser",
      "UseStandardFonts",
    ]);
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
