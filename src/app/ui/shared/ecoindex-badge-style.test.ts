import { describe, expect, it } from "vitest";
import { contrastRatio } from "../theme/contrast";
import { getEcoIndexGrade } from "../../domain/use-case/ecoindex";
import { ecoIndexBadgeStyle } from "./ecoindex-badge-style";

const gradeColours = (() => {
  const colours = new Set<string>();
  for (let i = 0; i <= 100; i++) {
    const grade = getEcoIndexGrade(i);
    if (grade) colours.add(grade.color);
  }
  return [...colours];
})();

describe("ecoIndexBadgeStyle", () => {
  it("covers the seven grades", () => {
    expect(gradeColours).toHaveLength(7);
  });

  it.each(gradeColours)("fills %s and gives a readable text colour", (colour) => {
    const style = ecoIndexBadgeStyle(colour);
    expect(style["background-color"]).toBe(colour);
    expect(style["border-color"]).toBe(colour);
    expect(["#000000", "#ffffff"]).toContain(style.color);
    expect(contrastRatio(style.color, colour)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(gradeColours)("picks the higher contrast of black and white on %s", (colour) => {
    const chosen = ecoIndexBadgeStyle(colour).color;
    const other = chosen === "#000000" ? "#ffffff" : "#000000";
    expect(contrastRatio(chosen, colour)).toBeGreaterThanOrEqual(contrastRatio(other, colour));
  });
});
