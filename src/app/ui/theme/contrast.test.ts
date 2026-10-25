import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  it("gives 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("gives 1 for equal colours", () => {
    expect(contrastRatio("#4a69bd", "#4a69bd")).toBe(1);
  });

  it("accepts the #rgb shorthand", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#000000")).toBeCloseTo(21, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#282828", "#bfc6ce")).toBe(contrastRatio("#bfc6ce", "#282828"));
  });

  it("matches a known value", () => {
    expect(contrastRatio("#bfc6ce", "#282828")).toBeCloseTo(8.55, 1);
  });
});
