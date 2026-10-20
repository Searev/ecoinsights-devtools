import { describe, expect, it } from "vitest";
import { ComparisonSubject } from "../../../domain/models/image-variants";
import { initialMode, isDisplayed, nativeCssSize, pageBox } from "./comparison-layout";

const subject = (display?: { width: number; height: number }): ComparisonSubject => ({
  url: "https://x.test/a.jpg",
  declaredType: "image/jpeg",
  ruleId: "r",
  recordedBytes: 1,
  display,
  versions: [{ id: "original", label: "Originale" }],
});

describe("comparison-layout", () => {
  it("S1: page box keeps the display size when it fits", () => {
    expect(pageBox({ width: 300, height: 200 }, 800)).toEqual({ width: 300, height: 200 });
  });

  it("S1: page box scales down proportionally when wider than the area", () => {
    expect(pageBox({ width: 900, height: 600 }, 450)).toEqual({ width: 450, height: 300 });
  });

  it("page box ignores a non-positive max width", () => {
    expect(pageBox({ width: 300, height: 200 }, 0)).toEqual({ width: 300, height: 200 });
  });

  it("S5: native CSS size is natural size divided by the pixel ratio", () => {
    expect(nativeCssSize({ width: 1200, height: 800 }, 2)).toEqual({ width: 600, height: 400 });
    expect(nativeCssSize({ width: 600, height: 400 }, 2)).toEqual({ width: 300, height: 200 });
  });

  it("S5: a non-positive pixel ratio counts as 1", () => {
    expect(nativeCssSize({ width: 600, height: 400 }, 0)).toEqual({ width: 600, height: 400 });
    expect(nativeCssSize({ width: 600, height: 400 }, -1)).toEqual({ width: 600, height: 400 });
  });

  it("S6/L3: not displayed subjects open in native mode", () => {
    expect(isDisplayed(subject({ width: 300, height: 200 }))).toBe(true);
    expect(initialMode(subject({ width: 300, height: 200 }))).toBe("page");
    for (const s of [subject({ width: 0, height: 0 }), subject({ width: 0, height: 5 }), subject()]) {
      expect(isDisplayed(s)).toBe(false);
      expect(initialMode(s)).toBe("native");
    }
  });
});
